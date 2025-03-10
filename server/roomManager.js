// roomManager.js - Manages game rooms with collaborative code support and voting

// In-memory storage for rooms
const rooms = {};

// Constants for the game
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const PLAYER_RADIUS = 20;
const VOTING_DURATION = 4000; // 4 seconds for voting

// Default player colors if not provided
const DEFAULT_PLAYER_COLORS = [
  "#FF5733", // Red
  "#33FF57", // Green
  "#3357FF", // Blue
  "#F3FF33", // Yellow
  "#FF33F3", // Purple
  "#33FFF3", // Cyan
  "#F333FF", // Magenta
  "#FFA233", // Orange
];

// Default code when a room is created
const DEFAULT_CODE = `// Write code to modify physics here
// Example:
// if (sphere.y > 500) {
//   sphere.applyForce(0, -20); // Reverse gravity
// }
`;

function createRoomWithId(roomId, name) {
  console.log(`Creating new room with ID: ${roomId} and name: ${name}`);

  const newRoom = {
    id: roomId,
    name: name || `Room ${roomId}`,
    players: {},
    codeHistory: [],
    currentCode: DEFAULT_CODE,
    physics: {
      gravity: 0.5,
      friction: 0.98,
      bounce: 0.8,
    },
    codeVotes: {
      current: null, // Current code proposal being voted on
      votes: {}, // Map of playerId -> vote (1 for upvote, -1 for downvote)
      proposedBy: null, // Player who proposed the code
      proposedAt: null, // When the code was proposed
      votingEndTime: null, // When voting ends
      proposedCode: null, // The code being voted on
    },
    codeSnapshots: [], // For time travel/undo functionality
    createdAt: new Date().toISOString(),
  };

  // Add it to our rooms collection
  rooms[roomId] = newRoom;

  return newRoom;
}

// Create a new room
function createRoom(name) {
  const roomId = generateRoomId();
  console.log(`Creating new room with ID: ${roomId} and name: ${name}`);

  // Create the room object
  const newRoom = {
    id: roomId,
    name: name || `Room ${roomId}`,
    players: {},
    codeHistory: [],
    currentCode: DEFAULT_CODE,
    physics: {
      gravity: 0.5,
      friction: 0.98,
      bounce: 0.8,
    },
    codeVotes: {
      current: null, // Current code proposal being voted on
      votes: {}, // Map of playerId -> vote (1 for upvote, -1 for downvote)
      proposedBy: null, // Player who proposed the code
      proposedAt: null, // When the code was proposed
      votingEndTime: null, // When voting ends
      proposedCode: null, // The code being voted on
    },
    codeSnapshots: [], // For time travel/undo functionality
    createdAt: new Date().toISOString(),
  };

  // Add it to our rooms collection
  rooms[roomId] = newRoom;

  console.log(
    `Room created successfully, total rooms: ${Object.keys(rooms).length}`
  );
  console.log(`Rooms: ${JSON.stringify(Object.keys(rooms))}`);

  return newRoom;
}

// Get a specific room
function getRoom(roomId) {
  console.log(`Getting room ${roomId}, exists: ${!!rooms[roomId]}`);
  return rooms[roomId];
}

// Get all rooms
function getRooms() {
  return rooms;
}

// Join a room
function joinRoom(roomId, socketId, playerName, playerColor) {
  const room = rooms[roomId];
  console.log(`Joining room ${roomId}, room exists: ${!!room}`);

  if (!room) {
    console.log(`Room ${roomId} doesn't exist`);
    return null;
  }

  // Generate a random position that doesn't overlap with existing players
  let position;
  let attempts = 0;
  const maxAttempts = 50;

  do {
    position = {
      x: PLAYER_RADIUS + Math.random() * (WORLD_WIDTH - 2 * PLAYER_RADIUS),
      y: PLAYER_RADIUS + Math.random() * (WORLD_HEIGHT - 2 * PLAYER_RADIUS),
    };
    attempts++;
  } while (checkOverlap(position, room.players) && attempts < maxAttempts);

  // Assign a color - use the player's chosen color if provided, otherwise use a default
  const playerCount = Object.keys(room.players).length;
  const color =
    playerColor ||
    DEFAULT_PLAYER_COLORS[playerCount % DEFAULT_PLAYER_COLORS.length];

  // Create player object
  const player = {
    id: socketId,
    name: playerName || `Player ${socketId.substring(0, 5)}`,
    position,
    velocity: { x: 0, y: 0 },
    radius: PLAYER_RADIUS,
    color: color,
    joinedAt: new Date().toISOString(),
  };

  room.players[socketId] = player;
  return player;
}

// Leave a room
function leaveRoom(roomId, socketId) {
  const room = rooms[roomId];
  if (!room) return null;

  delete room.players[socketId];

  // Remove any votes from this player
  if (room.codeVotes.current && room.codeVotes.votes[socketId]) {
    delete room.codeVotes.votes[socketId];
  }

  // If room is empty, delete it
  if (Object.keys(room.players).length === 0) {
    delete rooms[roomId];
    return null;
  }

  return room;
}

// Update room code (for collaborative editing without execution)
function updateRoomCode(roomId, code) {
  const room = rooms[roomId];
  if (!room) return false;

  room.editorContent = code;
  return true;
}

// Propose code for voting
function proposeCode(roomId, code, playerId, playerName) {
  const room = rooms[roomId];
  if (!room) return { success: false, error: "Room not found" };

  // Check if voting is already in progress
  if (room.codeVotes.current && Date.now() < room.codeVotes.votingEndTime) {
    return {
      success: false,
      error: "Another vote is in progress",
      votingEndTime: room.codeVotes.votingEndTime,
    };
  }

  // Save current code as a snapshot for time travel functionality
  saveCodeSnapshot(roomId);

  // Start a new vote
  room.codeVotes = {
    current: Date.now(),
    votes: {},
    proposedBy: playerId,
    proposedByName: playerName,
    proposedAt: Date.now(),
    votingEndTime: Date.now() + VOTING_DURATION,
    proposedCode: code,
  };

  // Proposer automatically upvotes their own code
  room.codeVotes.votes[playerId] = 1;

  return {
    success: true,
    votingEndTime: room.codeVotes.votingEndTime,
    proposalId: room.codeVotes.current,
  };
}

// Submit a vote on proposed code
function voteOnCode(roomId, playerId, vote) {
  const room = rooms[roomId];
  if (!room || !room.codeVotes.current)
    return { success: false, error: "No active vote" };

  // Check if voting is still open
  if (Date.now() > room.codeVotes.votingEndTime) {
    return { success: false, error: "Voting has ended" };
  }

  // Record the vote (1 for upvote, -1 for downvote)
  room.codeVotes.votes[playerId] = vote === "upvote" ? 1 : -1;

  return {
    success: true,
    votesUp: Object.values(room.codeVotes.votes).filter((v) => v === 1).length,
    votesDown: Object.values(room.codeVotes.votes).filter((v) => v === -1)
      .length,
  };
}

// Check if voting has concluded and if code should be executed
function checkVoting(roomId) {
  const room = rooms[roomId];
  if (!room || !room.codeVotes.current) return null;

  // Check if voting time has expired
  if (Date.now() < room.codeVotes.votingEndTime) {
    return null; // Voting still in progress
  }

  // Count votes
  const upvotes = Object.values(room.codeVotes.votes).filter(
    (v) => v === 1
  ).length;
  const downvotes = Object.values(room.codeVotes.votes).filter(
    (v) => v === -1
  ).length;
  const totalPlayers = Object.keys(room.players).length;

  // Determine if code should be executed
  const shouldExecute = downvotes - upvotes <= totalPlayers / 2;

  const result = {
    proposalId: room.codeVotes.current,
    upvotes,
    downvotes,
    totalPlayers,
    shouldExecute,
    proposedCode: room.codeVotes.proposedCode,
    proposedBy: room.codeVotes.proposedBy,
    proposedByName: room.codeVotes.proposedByName,
  };

  // Reset voting state
  if (shouldExecute) {
    // If approved, update the current code
    room.currentCode = room.codeVotes.proposedCode;
  }

  // Clear voting state
  room.codeVotes.current = null;

  return result;
}

// Save a snapshot of the current code for undo/time travel
function saveCodeSnapshot(roomId) {
  const room = rooms[roomId];
  if (!room) return false;

  // Save current state as a snapshot
  room.codeSnapshots.push({
    code: room.currentCode,
    timestamp: Date.now(),
    physics: { ...room.physics },
  });

  // Keep only the last 20 snapshots to limit memory usage
  if (room.codeSnapshots.length > 20) {
    room.codeSnapshots.shift();
  }

  return true;
}

// Undo to previous code state
function undoCodeChange(roomId) {
  const room = rooms[roomId];
  if (!room || room.codeSnapshots.length === 0) return null;

  // Get the latest snapshot
  const lastSnapshot = room.codeSnapshots.pop();

  // Restore state from snapshot
  room.currentCode = lastSnapshot.code;
  room.physics = { ...lastSnapshot.physics };

  return {
    code: room.currentCode,
    physics: room.physics,
    timestamp: lastSnapshot.timestamp,
  };
}

// Helper: Generate a random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper: Check if a position overlaps with existing players
function checkOverlap(position, players) {
  for (const playerId in players) {
    const player = players[playerId];
    const dx = position.x - player.position.x;
    const dy = position.y - player.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 2 * PLAYER_RADIUS) {
      return true; // Overlap detected
    }
  }
  return false;
}

// Debug: Print all rooms
function debugRooms() {
  console.log("------ ROOMS DEBUG ------");
  console.log(`Total rooms: ${Object.keys(rooms).length}`);
  for (const roomId in rooms) {
    console.log(
      `Room ${roomId}: ${rooms[roomId].name}, players: ${
        Object.keys(rooms[roomId].players).length
      }`
    );
  }
  console.log("-------------------------");
}

module.exports = {
  createRoom,
  getRoom,
  getRooms,
  joinRoom,
  leaveRoom,
  updateRoomCode,
  proposeCode,
  voteOnCode,
  checkVoting,
  saveCodeSnapshot,
  undoCodeChange,
  debugRooms,
  VOTING_DURATION,
  rooms,
  createRoomWithId,
  WORLD_WIDTH,
  // Export the rooms object directly
};
