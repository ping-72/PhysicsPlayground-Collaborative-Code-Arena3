import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import io from "socket.io-client";
import "./Lobby.css";

const ENDPOINT = "http://localhost:5000";

// Available player colors
const PLAYER_COLORS = [
  { name: "Red", value: "#FF5733" },
  { name: "Green", value: "#33FF57" },
  { name: "Blue", value: "#3357FF" },
  { name: "Yellow", value: "#F3FF33" },
  { name: "Purple", value: "#FF33F3" },
  { name: "Cyan", value: "#33FFF3" },
  { name: "Magenta", value: "#F333FF" },
  { name: "Orange", value: "#FFA233" },
];

function Lobby() {
  const [socket, setSocket] = useState(null);
  const [rooms, setRooms] = useState({});
  const [newRoomName, setNewRoomName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerColor, setPlayerColor] = useState(PLAYER_COLORS[0].value);
  const [connected, setConnected] = useState(false);
  const navigate = useNavigate();

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(ENDPOINT);

    newSocket.on("connect", () => {
      console.log("Connected to server");
      setConnected(true);
      newSocket.emit("getRooms");
    });

    newSocket.on("roomsList", (roomsList) => {
      setRooms(roomsList);
    });

    newSocket.on("disconnect", () => {
      console.log("Disconnected from server");
      setConnected(false);
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Handle room creation
  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (newRoomName.trim() && socket) {
      socket.emit("createRoom", newRoomName);
      setNewRoomName("");
    }
  };

  // Handle joining a room
  const handleJoinRoom = (roomId) => {
    if (!playerName.trim()) {
      alert("Please enter your name before joining a room");
      return;
    }

    if (socket) {
      // Store player name and color in localStorage for persistence
      localStorage.setItem("playerName", playerName);
      localStorage.setItem("playerColor", playerColor);

      // Join the room
      socket.emit("joinRoom", { roomId, playerName, playerColor });

      // Navigate to room
      navigate(`/room/${roomId}`);
    }
  };

  // Refresh rooms list
  const refreshRooms = () => {
    if (socket) {
      socket.emit("getRooms");
    }
  };

  // Load stored player name and color
  useEffect(() => {
    const storedName = localStorage.getItem("playerName");
    if (storedName) {
      setPlayerName(storedName);
    }

    const storedColor = localStorage.getItem("playerColor");
    if (storedColor) {
      setPlayerColor(storedColor);
    }
  }, []);

  return (
    <div className="lobby-container">
      <h1>Physics Game Lobby</h1>

      <div className="player-info">
        <div className="player-name-input">
          <label htmlFor="playerName">Your Name:</label>
          <input
            type="text"
            id="playerName"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
          />
        </div>

        <div className="player-color-select">
          <label htmlFor="playerColor">Your Color:</label>
          <div className="color-options">
            {PLAYER_COLORS.map((color) => (
              <div
                key={color.value}
                className={`color-option ${
                  playerColor === color.value ? "selected" : ""
                }`}
                style={{ backgroundColor: color.value }}
                onClick={() => setPlayerColor(color.value)}
                title={color.name}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="create-room">
        <h2>Create a New Room</h2>
        <form onSubmit={handleCreateRoom}>
          <input
            type="text"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Room name"
          />
          <button type="submit">Create Room</button>
        </form>
      </div>

      <div className="rooms-list">
        <div className="rooms-header">
          <h2>Available Rooms</h2>
          <button onClick={refreshRooms} className="refresh-button">
            Refresh
          </button>
        </div>

        {Object.keys(rooms).length === 0 ? (
          <p>No rooms available. Create one to get started!</p>
        ) : (
          <ul>
            {Object.values(rooms).map((room) => (
              <li key={room.id} className="room-item">
                <div className="room-info">
                  <h3>{room.name}</h3>
                  <p>{Object.keys(room.players).length} players</p>
                </div>
                <button onClick={() => handleJoinRoom(room.id)}>
                  Join Room
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="connection-status">
        Status: {connected ? "Connected" : "Disconnected"}
      </div>
    </div>
  );
}

export default Lobby;
