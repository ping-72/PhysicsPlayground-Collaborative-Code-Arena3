// server.js - With code voting and secure execution
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const roomManager = require("./roomManager");
const {
  updatePlayerPosition,
  handleCollisions,
  updatePhysicsWithCode,
  isMaliciousCode,
} = require("./gameState");

// Log the room manager object to make sure it loads properly
console.log("Server starting with enhanced roomManager initialized");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 5000;

// Handle voting timeouts
const votingTimers = {};

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Get rooms list
  socket.on("getRooms", () => {
    socket.emit("roomsList", roomManager.getRooms());
  });

  // Create a new room
  socket.on("createRoom", (roomName) => {
    const room = roomManager.createRoom(roomName);
    socket.emit("roomCreated", room);
    io.emit("roomsList", roomManager.getRooms());
  });

  // Join a room
  socket.on("joinRoom", ({ roomId, playerName, playerColor }) => {
    console.log(
      `Player ${playerName} (${socket.id}) attempting to join room ${roomId} with color ${playerColor}`
    );

    try {
      // Check if room exists, if not create it
      let room = roomManager.getRoom(roomId);

      if (!room) {
        console.log(`Room ${roomId} not found, creating it`);
        room = roomManager.createRoomWithId(roomId, `Game Room ${roomId}`);
        console.log(`Created room with ID: ${room.id}`);
      }

      console.log(
        `Room after creation/check: ${JSON.stringify(
          room ? { id: room.id, name: room.name } : null
        )}`
      );
      console.log(`Total rooms: ${Object.keys(roomManager.getRooms()).length}`);

      // Just to be extra safe, verify the room was created
      if (!room) {
        console.error(`Failed to access room ${roomId} after creation attempt`);
        socket.emit("error", {
          message: "Failed to create room - server error",
        });
        return;
      }

      // Now join the room with the player's color
      const player = roomManager.joinRoom(
        room.id,
        socket.id,
        playerName,
        playerColor
      );
      if (player) {
        socket.join(room.id);
        console.log(
          `Player ${playerName} joined room ${room.id} successfully with color ${player.color}`
        );

        // Send the joined event to the player
        socket.emit("joinedRoom", { roomId: room.id, player });

        // Also send the current code editor content
        socket.emit("codeEditorContent", room.currentCode || "");

        // If there's an active vote, send that info too
        if (room.codeVotes.current) {
          socket.emit("voteInProgress", {
            proposalId: room.codeVotes.current,
            proposedBy: room.codeVotes.proposedByName,
            proposedCode: room.codeVotes.proposedCode,
            votingEndTime: room.codeVotes.votingEndTime,
            currentVotes: {
              up: Object.values(room.codeVotes.votes).filter((v) => v === 1)
                .length,
              down: Object.values(room.codeVotes.votes).filter((v) => v === -1)
                .length,
            },
          });
        }

        // Send the updated room to all players in the room
        const updatedRoom = roomManager.getRoom(room.id);
        io.to(room.id).emit("playerJoined", updatedRoom);
      } else {
        console.error(`Failed to join player to room ${roomId}`);
        socket.emit("error", { message: "Failed to join room" });
      }
    } catch (error) {
      console.error(`Error in join room handler: ${error.message}`);
      socket.emit("error", { message: "Server error occurred" });
    }
  });

  // Leave a room
  socket.on("leaveRoom", (roomId) => {
    const room = roomManager.leaveRoom(roomId, socket.id);
    if (room) {
      socket.leave(roomId);
      io.to(roomId).emit("playerLeft", room);
      io.emit("roomsList", roomManager.getRooms());
    }
  });

  // Handle player movement
  socket.on("updatePosition", ({ roomId, position, velocity }) => {
    const updatedState = updatePlayerPosition(
      roomId,
      socket.id,
      position,
      velocity
    );
    if (updatedState) {
      io.to(roomId).emit("gameStateUpdate", updatedState);
    }
  });

  // Handle code submissions - First propose for voting
  socket.on("proposeCode", ({ roomId, code, playerName }) => {
    try {
      // First check if code is malicious
      const maliciousCheck = isMaliciousCode(code);
      if (maliciousCheck) {
        socket.emit("codeRejected", {
          error: `Code security check failed: Malicious code detected`,
          code,
        });
        return;
      }

      // Then propose for voting
      const result = roomManager.proposeCode(
        roomId,
        code,
        socket.id,
        playerName
      );

      if (!result.success) {
        socket.emit("proposalRejected", {
          error: result.error,
          votingEndTime: result.votingEndTime,
        });
        return;
      }

      // Broadcast to all players that voting has started
      io.to(roomId).emit("voteStarted", {
        proposalId: result.proposalId,
        proposedBy: playerName,
        proposedCode: code,
        votingEndTime: result.votingEndTime,
      });

      // Set a timer to check the vote when time expires
      if (votingTimers[roomId]) {
        clearTimeout(votingTimers[roomId]);
      }

      votingTimers[roomId] = setTimeout(() => {
        handleVoteCompletion(roomId);
      }, roomManager.VOTING_DURATION + 100); // Add a small buffer
    } catch (error) {
      console.error(`Error proposing code: ${error.message}`);
      socket.emit("proposalRejected", { error: error.message });
    }
  });

  // Handle votes on code proposals
  socket.on("submitVote", ({ roomId, vote }) => {
    try {
      const result = roomManager.voteOnCode(roomId, socket.id, vote);

      if (!result.success) {
        socket.emit("voteRejected", { error: result.error });
        return;
      }

      // Broadcast vote counts to all players
      io.to(roomId).emit("voteUpdated", {
        votesUp: result.votesUp,
        votesDown: result.votesDown,
      });
    } catch (error) {
      console.error(`Error submitting vote: ${error.message}`);
      socket.emit("voteRejected", { error: error.message });
    }
  });

  // Handle collaborative code editing - real-time updates without execution
  socket.on("codeEditorChange", ({ roomId, code, cursorPosition }) => {
    const room = roomManager.getRoom(roomId);
    if (room) {
      // Update the current editor code without running it
      // This is only for collaborative editing, not for execution
      roomManager.updateRoomCode(roomId, code);

      // Broadcast the code changes to all other clients
      socket.to(roomId).emit("codeEditorUpdate", {
        code,
        cursorPosition,
        playerId: socket.id,
      });
    }
  });

  // Handle undo request
  socket.on("undoCode", ({ roomId }) => {
    try {
      const result = roomManager.undoCodeChange(roomId);

      if (!result) {
        socket.emit("undoRejected", {
          error: "No previous code state available",
        });
        return;
      }

      // Broadcast the undo to all players
      io.to(roomId).emit("codeUndone", {
        code: result.code,
        physics: result.physics,
        timestamp: result.timestamp,
      });
    } catch (error) {
      console.error(`Error undoing code: ${error.message}`);
      socket.emit("undoRejected", { error: error.message });
    }
  });

  // Handle disconnections
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    // Find and leave all rooms where this socket was a player
    const allRooms = roomManager.getRooms();
    for (const roomId in allRooms) {
      const room = roomManager.leaveRoom(roomId, socket.id);
      if (room) {
        io.to(roomId).emit("playerLeft", room);
      }
    }
    io.emit("roomsList", roomManager.getRooms());
  });
});

// Helper function to handle vote completion
function handleVoteCompletion(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  const voteResult = roomManager.checkVoting(roomId);
  if (!voteResult) return; // Vote might have been reset or isn't complete

  console.log(`Vote completed for room ${roomId}:`, voteResult);

  // Broadcast the result to all players in the room
  io.to(roomId).emit("voteCompleted", voteResult);

  // If code was approved, execute it
  if (voteResult.shouldExecute) {
    try {
      // Execute the code
      const executionResult = updatePhysicsWithCode(
        roomId,
        voteResult.proposedCode
      );

      // Add code to history
      const codeEntry = {
        id: Date.now(),
        playerId: voteResult.proposedBy,
        playerName: voteResult.proposedByName,
        code: voteResult.proposedCode,
        timestamp: new Date().toISOString(),
        upvotes: voteResult.upvotes,
        downvotes: voteResult.downvotes,
      };

      if (!room.codeHistory) {
        room.codeHistory = [];
      }
      room.codeHistory.push(codeEntry);

      // Broadcast code execution success
      io.to(roomId).emit("codeExecuted", {
        success: true,
        codeEntry,
        physics: executionResult.physics,
      });

      io.to(roomId).emit("codeSubmitted", codeEntry);
    } catch (error) {
      console.error(`Error executing approved code: ${error.message}`);

      const failedCodeEntry = {
        id: Date.now(),
        playerId: voteResult.proposedBy,
        playerName: voteResult.proposedByName,
        code: voteResult.proposedCode,
        timestamp: new Date().toISOString(),
        upvotes: voteResult.upvotes,
        downvotes: voteResult.downvotes,
        success: false,
        error: error.message,
      };

      if (!room.codeHistory) {
        room.codeHistory = [];
      }
      room.codeHistory.push(failedCodeEntry);

      io.to(roomId).emit("codeExecuted", {
        success: false,
        error: error.message,
        proposedBy: voteResult.proposedByName,
      });
    }
  } else {
    const rejectedCodeEntry = {
      id: Date.now(),
      playerId: voteResult.proposedBy,
      playerName: voteResult.proposedByName,
      code: voteResult.proposedCode,
      timestamp: new Date().toISOString(),
      upvotes: voteResult.upvotes,
      downvotes: voteResult.downvotes,
      success: false,
      rejected: true,
    };

    if (!room.codeHistory) {
      room.codeHistory = [];
    }
    room.codeHistory.push(rejectedCodeEntry);

    io.to(roomId).emit("codeExecuted", { rejectedCodeEntry });

    // Clear the timer
    if (!votingTimers[roomId]) {
      clearTimeout(votingTimers[roomId]);
      delete votingTimers[roomId];
    }
  }
}

// Basic routes
app.get("/", (req, res) => {
  res.send("Collaborative Physics Game Server");
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
