import React, { useEffect, useRef, useState } from "react";
import "./GameCanvas.css";

// Constants
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const KEY_CODES = {
  UP: "ArrowUp",
  DOWN: "ArrowDown",
  LEFT: "ArrowLeft",
  RIGHT: "ArrowRight",
  W: "KeyW",
  A: "KeyA",
  S: "KeyS",
  D: "KeyD",
};

function GameCanvas({ gameState, playerId, updatePosition }) {
  const canvasRef = useRef(null);
  const [keys, setKeys] = useState({});
  const playerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastUpdateTimeRef = useRef(Date.now());

  // Initialize canvas and start game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return; // Guard against canvas not being available

    const context = canvas.getContext("2d");

    // Set canvas dimensions
    canvas.width = WORLD_WIDTH;
    canvas.height = WORLD_HEIGHT;

    // Start game loop
    const gameLoop = () => {
      // Draw a loading screen if gameState or player info is not available yet
      if (!gameState || !gameState.players) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#f0f0f0";
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.font = "20px Arial";
        context.fillStyle = "#666";
        context.textAlign = "center";
        context.fillText(
          "Loading game...",
          canvas.width / 2,
          canvas.height / 2
        );

        animationFrameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // Check if current player exists in the game state
      if (!gameState.players[playerId]) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#f0f0f0";
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.font = "20px Arial";
        context.fillStyle = "#666";
        context.textAlign = "center";
        context.fillText(
          "Waiting to join game...",
          canvas.width / 2,
          canvas.height / 2
        );

        animationFrameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // Update current player's reference
      playerRef.current = { ...gameState.players[playerId] };

      // Clear canvas
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background
      context.fillStyle = "#f0f0f0";
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Draw all players
      for (const id in gameState.players) {
        const player = gameState.players[id];

        // Draw player circle
        context.beginPath();
        context.arc(
          player.position.x,
          player.position.y,
          player.radius,
          0,
          Math.PI * 2
        );
        context.fillStyle = player.color;
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = id === playerId ? "#000" : "#444";
        context.stroke();

        // Draw player name
        context.font = "12px Arial";
        context.fillStyle = "#000";
        context.textAlign = "center";
        context.fillText(
          player.name || `Player ${id.substring(0, 5)}`,
          player.position.x,
          player.position.y - player.radius - 5
        );
      }

      // Request next frame
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    // Start game loop
    gameLoop();

    // Clean up on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState, playerId]);

  // Handle keyboard input
  useEffect(() => {
    // Handle key down
    const handleKeyDown = (e) => {
      setKeys((prevKeys) => ({ ...prevKeys, [e.code]: true }));
    };

    // Handle key up
    const handleKeyUp = (e) => {
      setKeys((prevKeys) => ({ ...prevKeys, [e.code]: false }));
    };

    // Add event listeners
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Clean up on unmount
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Handle player movement
  useEffect(() => {
    if (!gameState || !gameState.players || !gameState.players[playerId]) {
      return;
    }

    // Player movement handler
    const movePlayer = () => {
      if (!playerRef.current) return;

      const player = playerRef.current;
      const now = Date.now();
      const deltaTime = (now - lastUpdateTimeRef.current) / 1000; // Time in seconds
      lastUpdateTimeRef.current = now;

      // Apply a reasonable force for movement
      const force = 0.5; // Adjust based on your game feel

      // Get current velocity
      const velocity = {
        x: player.velocity.x,
        y: player.velocity.y,
      };

      // Apply force based on key presses
      if (keys[KEY_CODES.UP] || keys[KEY_CODES.W]) {
        velocity.y -= force * deltaTime * 60; // Scale by deltaTime for frame independence
      }
      if (keys[KEY_CODES.DOWN] || keys[KEY_CODES.S]) {
        velocity.y += force * deltaTime * 60;
      }
      if (keys[KEY_CODES.LEFT] || keys[KEY_CODES.A]) {
        velocity.x -= force * deltaTime * 60;
      }
      if (keys[KEY_CODES.RIGHT] || keys[KEY_CODES.D]) {
        velocity.x += force * deltaTime * 60;
      }

      // Update position for local prediction
      const position = {
        x: player.position.x + velocity.x,
        y: player.position.y + velocity.y,
      };

      // Send update to server
      updatePosition(position, velocity);
    };

    // Set up interval for movement updates
    const interval = setInterval(movePlayer, 16); // ~60fps

    // Clean up on unmount
    return () => {
      clearInterval(interval);
    };
  }, [gameState, playerId, keys, updatePosition]);

  return (
    <div className="game-canvas-container">
      <canvas
        ref={canvasRef}
        width={WORLD_WIDTH}
        height={WORLD_HEIGHT}
      ></canvas>
      <div className="controls-info">
        <p>Use arrow keys or WASD to move</p>
      </div>
    </div>
  );
}

export default GameCanvas;
