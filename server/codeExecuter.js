// gameState.js - Manages game physics and state with code execution
const roomManager = require("./roomManager");
const { VM } = require("vm2"); // You'll need to install this: npm install vm2

// Constants
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;

// Update player position
function updatePlayerPosition(roomId, playerId, position, velocity) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.players[playerId]) return null;

  // Update player position and velocity
  room.players[playerId].position = position;
  room.players[playerId].velocity = velocity;

  // Apply physics to all players
  applyPhysics(room);

  // Handle collisions between players
  handleCollisions(room);

  // Return the updated game state
  return {
    players: room.players,
    physics: room.physics,
  };
}

// Apply physics to all players
function applyPhysics(room) {
  const { gravity, friction, bounce } = room.physics;

  for (const playerId in room.players) {
    const player = room.players[playerId];

    // Apply gravity
    player.velocity.y += gravity;

    // Apply friction
    player.velocity.x *= friction;
    player.velocity.y *= friction;

    // Update position
    player.position.x += player.velocity.x;
    player.position.y += player.velocity.y;

    // Constrain to world boundaries
    if (player.position.x < player.radius) {
      player.position.x = player.radius;
      player.velocity.x *= -bounce;
    } else if (player.position.x > WORLD_WIDTH - player.radius) {
      player.position.x = WORLD_WIDTH - player.radius;
      player.velocity.x *= -bounce;
    }

    if (player.position.y < player.radius) {
      player.position.y = player.radius;
      player.velocity.y *= -bounce;
    } else if (player.position.y > WORLD_HEIGHT - player.radius) {
      player.position.y = WORLD_HEIGHT - player.radius;
      player.velocity.y *= -bounce;
    }
  }
}

// Handle collisions between players
function handleCollisions(room) {
  const playerIds = Object.keys(room.players);

  // Check each pair of players for collision
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const player1 = room.players[playerIds[i]];
      const player2 = room.players[playerIds[j]];

      // Calculate distance between players
      const dx = player2.position.x - player1.position.x;
      const dy = player2.position.y - player1.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Check if collision occurred
      if (distance < player1.radius + player2.radius) {
        // Calculate collision normal
        const nx = dx / distance;
        const ny = dy / distance;

        // Calculate relative velocity
        const dvx = player2.velocity.x - player1.velocity.x;
        const dvy = player2.velocity.y - player1.velocity.y;

        // Calculate impulse
        const impulse = (2 * (dvx * nx + dvy * ny)) / 2; // Assuming equal masses

        // Apply impulse
        player1.velocity.x += impulse * nx * room.physics.bounce;
        player1.velocity.y += impulse * ny * room.physics.bounce;
        player2.velocity.x -= impulse * nx * room.physics.bounce;
        player2.velocity.y -= impulse * ny * room.physics.bounce;

        // Separate players to prevent sticking
        const overlap = player1.radius + player2.radius - distance;
        player1.position.x -= overlap * nx * 0.5;
        player1.position.y -= overlap * ny * 0.5;
        player2.position.x += overlap * nx * 0.5;
        player2.position.y += overlap * ny * 0.5;
      }
    }
  }
}

// Create a sandbox environment for user code
function createSandbox(room) {
  return {
    world: {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      gravity: room.physics.gravity,
      friction: room.physics.friction,
      bounce: room.physics.bounce,
      setGravity: (value) => {
        if (typeof value === "number" && !isNaN(value)) {
          room.physics.gravity = Math.max(-2, Math.min(2, value)); // Limit range to prevent extreme values
        }
      },
      setFriction: (value) => {
        if (typeof value === "number" && !isNaN(value)) {
          room.physics.friction = Math.max(0.5, Math.min(0.99, value)); // Limit range
        }
      },
      setBounce: (value) => {
        if (typeof value === "number" && !isNaN(value)) {
          room.physics.bounce = Math.max(0, Math.min(1.5, value)); // Limit range
        }
      },
      // Custom functions can be added here
      getPlayerCount: () => Object.keys(room.players).length,
      getTime: () => Date.now(),
    },
    console: {
      log: (...args) => console.log("User code log:", ...args),
      error: (...args) => console.error("User code error:", ...args),
    },
    Math: Math,
    Date: Date,
    players: Object.values(room.players).map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      x: player.position.x,
      y: player.position.y,
      radius: player.radius,
    })),
  };
}

// Safely execute user code to modify physics
function updatePhysicsWithCode(roomId, code) {
  const room = roomManager.getRoom(roomId);
  if (!room) return null;

  try {
    const sandbox = createSandbox(room);
    const vm = new VM({
      timeout: 200, // 200ms timeout to prevent infinite loops
      sandbox,
    });

    // Wrap the code to apply to each player's sphere
    const wrappedCode = `
      function processPlayers() {
        const allPlayers = players;
        ${code}
        return true;
      }
      processPlayers();
    `;

    // Execute the code in the sandbox
    vm.run(wrappedCode);

    // Check if any player now has extreme velocity values
    for (const playerId in room.players) {
      const player = room.players[playerId];

      // Limit velocity to reasonable values
      player.velocity.x = Math.max(-15, Math.min(15, player.velocity.x));
      player.velocity.y = Math.max(-15, Math.min(15, player.velocity.y));
    }

    // Return the updated physics state
    return {
      physics: room.physics,
      players: room.players,
    };
  } catch (error) {
    console.error("Error executing user code:", error.message);
    throw new Error(`Code execution error: ${error.message}`);
  }
}

// Allow the current user code to affect a specific player for this frame
function applyUserCodeToPlayer(room, player) {
  if (!room || !room.currentCode || room.currentCode.trim() === "") {
    return;
  }

  try {
    const sandbox = {
      sphere: {
        x: player.position.x,
        y: player.position.y,
        vx: player.velocity.x,
        vy: player.velocity.y,
        radius: player.radius,
        applyForce: (x, y) => {
          if (
            typeof x === "number" &&
            typeof y === "number" &&
            !isNaN(x) &&
            !isNaN(y)
          ) {
            player.velocity.x += x;
            player.velocity.y += y;
          }
        },
        setVelocity: (x, y) => {
          if (
            typeof x === "number" &&
            typeof y === "number" &&
            !isNaN(x) &&
            !isNaN(y)
          ) {
            player.velocity.x = x;
            player.velocity.y = y;
          }
        },
      },
      world: {
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        gravity: room.physics.gravity,
        friction: room.physics.friction,
        bounce: room.physics.bounce,
      },
      console: {
        log: (...args) => console.log("User code log:", ...args),
      },
      Math: Math,
    };

    const vm = new VM({
      timeout: 10, // Short timeout for per-frame execution
      sandbox,
    });

    // Execute the code with the current player's sphere
    vm.run(room.currentCode);

    // Apply velocity limits
    player.velocity.x = Math.max(-15, Math.min(15, player.velocity.x));
    player.velocity.y = Math.max(-15, Math.min(15, player.velocity.y));
  } catch (error) {
    // Just log errors during frame updates, don't interrupt the game
    console.error("Error applying code to player:", error.message);
  }
}

module.exports = {
  updatePlayerPosition,
  handleCollisions,
  updatePhysicsWithCode,
  applyUserCodeToPlayer,
};
