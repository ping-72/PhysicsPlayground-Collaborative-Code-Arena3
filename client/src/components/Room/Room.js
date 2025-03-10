import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import GameCanvas from "../GameCanvas/GameCanvas";
import CodeEditor from "../CodeEditor/CodeEditor";
import CodeHistory from "../CodeEditor/CodeHistory";
import "./Room.css";

const ENDPOINT = "http://localhost:5000";

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [player, setPlayer] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [codeHistory, setCodeHistory] = useState([]);
  const [playerName, setPlayerName] = useState("");
  const [playerColor, setPlayerColor] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const joinAttemptedRef = useRef(false);

  // Initialize socket connection only once
  // In Room.js, modify the main useEffect hook
  useEffect(() => {
    // Get player name and color from localStorage
    const storedName = localStorage.getItem("playerName") || "Anonymous";
    const storedColor = localStorage.getItem("playerColor") || "#FF5733"; // Default to red if not set

    setPlayerName(storedName);
    setPlayerColor(storedColor);

    console.log(
      `Initializing connection for room ${roomId} as ${storedName} with color ${storedColor}`
    );

    // Create new socket connection
    const socket = io(ENDPOINT);
    socketRef.current = socket;

    // Setup all socket event handlers
    socket.on("connect", () => {
      console.log("Connected to server");
      setConnected(true);

      if (!joinAttemptedRef.current) {
        joinAttemptedRef.current = true;
        // Small delay to ensure socket is fully connected before joining
        setTimeout(() => {
          console.log(
            `Attempting to join room ${roomId} as ${storedName} with color ${storedColor}`
          );
          socket.emit("joinRoom", {
            roomId,
            playerName: storedName,
            playerColor: storedColor,
          });
        }, 500);
      }
    });

    // Other socket event handlers...
    socket.on("joinedRoom", ({ roomId, player }) => {
      console.log(`Successfully joined room ${roomId} as player:`, player);
      setPlayer(player);
      setError(null);
    });

    socket.on("playerJoined", (updatedRoom) => {
      console.log("Player joined, updated room:", updatedRoom);
      setRoom(updatedRoom);
      setGameState({
        players: updatedRoom.players,
        physics: updatedRoom.physics,
      });
      setCodeHistory(updatedRoom.codeHistory || []);
    });

    socket.on("playerLeft", (updatedRoom) => {
      console.log("Player left", updatedRoom);
      if (updatedRoom) {
        setRoom(updatedRoom);
        setGameState({
          players: updatedRoom.players,
          physics: updatedRoom.physics,
        });
      }
    });

    // Clean up on unmount
    return () => {
      console.log("Cleaning up Room component");
      if (socketRef.current) {
        // Remove all listeners to prevent memory leaks
        socketRef.current.removeAllListeners();

        // Only try to leave room if we're connected
        if (socketRef.current.connected) {
          console.log(`Leaving room ${roomId}`);
          socketRef.current.emit("leaveRoom", roomId);
        }

        // Always disconnect
        console.log("Disconnecting socket");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [roomId, navigate]); // Remove gameState from dependencies

  // Add a separate effect for handling gameState updates
  // Add a complete effect for handling all game updates
  useEffect(() => {
    if (socketRef.current) {
      // Game state updates
      socketRef.current.on("gameStateUpdate", (updatedState) => {
        setGameState(updatedState);
      });

      // Code history updates
      socketRef.current.on("codeSubmitted", (codeEntry) => {
        console.log("Code submitted and added to history:", codeEntry);
        setCodeHistory((prev) => [...prev, codeEntry]);
      });

      socketRef.current.on("codeExecuted", ({ success, codeEntry }) => {
        if (success && codeEntry) {
          setCodeHistory((prev) => {
            if (!prev.some((entry) => entry.id === codeEntry.id)) {
              return [...prev, codeEntry];
            }
            return prev;
          });
        }
      });

      // Physics updates
      socketRef.current.on("physicsUpdated", (newPhysics) => {
        console.log("Physics updated:", newPhysics);
        if (gameState) {
          setGameState((prevState) => ({
            ...prevState,
            physics: newPhysics,
          }));
        }
      });

      // Error handling
      socketRef.current.on("error", (error) => {
        console.error("Socket error:", error);
        setError(error.message);
      });

      // Return cleanup function
      return () => {
        const socket = socketRef.current;
        if (socket) {
          socket.off("gameStateUpdate");
          socket.off("codeSubmitted");
          socket.off("codeExecuted");
          socket.off("physicsUpdated");
          socket.off("error");
        }
      };
    }
  }, [gameState]);

  // Handle back to lobby button
  const handleBackToLobby = () => {
    if (socketRef.current) {
      socketRef.current.emit("leaveRoom", roomId);
    }
    navigate("/lobby");
  };

  // Handle code submission
  const handleCodeSubmit = (code) => {
    if (socketRef.current && connected) {
      socketRef.current.emit("proposeCode", { roomId, code, playerName });
    }
  };

  // Update player position
  const updatePosition = (position, velocity) => {
    if (socketRef.current && connected) {
      socketRef.current.emit("updatePosition", { roomId, position, velocity });
    }
  };

  return (
    <div className="room-container">
      <div className="room-header">
        <h1>{room ? room.name : "Loading..."}</h1>
        <button className="back-button" onClick={handleBackToLobby}>
          Back to Lobby
        </button>
      </div>

      <div className="connection-status">
        Status: {connected ? "Connected" : "Disconnected"}
        {error && <span className="error-message"> - Error: {error}</span>}
      </div>

      <div className="game-area">
        <div className="canvas-container">
          {gameState && player ? (
            <GameCanvas
              gameState={gameState}
              playerId={player.id}
              updatePosition={updatePosition}
            />
          ) : (
            <div className="loading-container">
              <p>Loading game...</p>
              {error && <p className="error-text">Error: {error}</p>}
            </div>
          )}
        </div>

        <div className="code-container">
          <CodeEditor
            onSubmit={handleCodeSubmit}
            socket={socketRef.current}
            roomId={roomId}
            playerName={playerName}
          />
          <CodeHistory codeHistory={codeHistory} />
        </div>
      </div>
    </div>
  );
}

export default Room;
