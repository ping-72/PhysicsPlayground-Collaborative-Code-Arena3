// gameState.js - Enhanced with secure code execution
const roomManager = require("./roomManager");
const { VM } = require("vm2"); // You'll need to install this: npm install vm2

// Constants
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const MAX_EXECUTION_TIME = 100; // ms
const MAX_CODE_LENGTH = 5000; // characters

// Blacklisted keywords that could indicate malicious code
const BLACKLISTED_TERMS = [
  "process",
  "require",
  "module",
  "eval",
  "__dirname",
  "__filename",
  "global",
  "Buffer",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearTimeout",
  "clearInterval",
  "clearImmediate",
  "XMLHttpRequest",
  "fetch",
  "WebSocket",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "document",
  "window",
  "navigator",
  "location",
  "Worker",
  "SharedWorker",
  "ServiceWorker",
  "console",
  "alert",
  "prompt",
  "confirm",
  "open",
];

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

    // Apply player-specific code if available
    if (room.currentCode) {
      applyUserCodeToPlayer(room, player);
    }

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

// Check if code contains potentially malicious elements
function isMaliciousCode(code) {
  // Check for extremely long code
  if (code.length > MAX_CODE_LENGTH) {
    return "Code exceeds maximum allowed length";
  }

  // Check for blacklisted terms
  for (const term of BLACKLISTED_TERMS) {
    if (code.includes(term)) {
      return `Code contains prohibited term: '${term}'`;
    }
  }

  // Check for infinite loops (primitive detection)
  if ((code.match(/while\s*\(/g) || []).length > 3) {
    return "Code contains too many while loops";
  }
  if ((code.match(/for\s*\(/g) || []).length > 3) {
    return "Code contains too many for loops";
  }

  // Check for potential regex denial of service
  if (code.includes("/.*.*.*.*.*.*.*.*.*.*.*.*.*.*./")) {
    return "Code contains potentially problematic regex pattern";
  }

  return null; // No malicious code detected
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
      // Safe utility functions
      getPlayerCount: () => Object.keys(room.players).length,
      getTime: () => Date.now(),
    },
    console: {
      log: (...args) => console.log("User code log:", ...args),
      error: (...args) => console.error("User code error:", ...args),
    },
    // Safe Math operations
    Math: {
      abs: Math.abs,
      acos: Math.acos,
      acosh: Math.acosh,
      asin: Math.asin,
      asinh: Math.asinh,
      atan: Math.atan,
      atan2: Math.atan2,
      atanh: Math.atanh,
      cbrt: Math.cbrt,
      ceil: Math.ceil,
      clz32: Math.clz32,
      cos: Math.cos,
      cosh: Math.cosh,
      exp: Math.exp,
      expm1: Math.expm1,
      floor: Math.floor,
      fround: Math.fround,
      hypot: Math.hypot,
      imul: Math.imul,
      log: Math.log,
      log10: Math.log10,
      log1p: Math.log1p,
      log2: Math.log2,
      max: Math.max,
      min: Math.min,
      pow: Math.pow,
      random: Math.random,
      round: Math.round,
      sign: Math.sign,
      sin: Math.sin,
      sinh: Math.sinh,
      sqrt: Math.sqrt,
      tan: Math.tan,
      tanh: Math.tanh,
      trunc: Math.trunc,
      E: Math.E,
      LN10: Math.LN10,
      LN2: Math.LN2,
      LOG10E: Math.LOG10E,
      LOG2E: Math.LOG2E,
      PI: Math.PI,
      SQRT1_2: Math.SQRT1_2,
      SQRT2: Math.SQRT2,
    },
    // Safe array methods for processing data
    Array: {
      isArray: Array.isArray,
    },
    // Pass a safe read-only version of the players
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

  // Check for malicious code
  const maliciousCheck = isMaliciousCode(code);
  if (maliciousCheck) {
    throw new Error(`Code security check failed: ${maliciousCheck}`);
  }

  try {
    const sandbox = createSandbox(room);
    const vm = new VM({
      timeout: MAX_EXECUTION_TIME, // Timeout to prevent infinite loops
      sandbox,
      compiler: "javascript", // Use the JS compiler for better performance
      eval: false, // Disable eval
      wasm: false, // Disable WebAssembly
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
            // Apply reasonable limits
            player.velocity.x += Math.max(-1, Math.min(1, x));
            player.velocity.y += Math.max(-1, Math.min(1, y));
          }
        },
        setVelocity: (x, y) => {
          if (
            typeof x === "number" &&
            typeof y === "number" &&
            !isNaN(x) &&
            !isNaN(y)
          ) {
            // Apply reasonable limits
            player.velocity.x = Math.max(-10, Math.min(10, x));
            player.velocity.y = Math.max(-10, Math.min(10, y));
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
      Math: {
        abs: Math.abs,
        acos: Math.acos,
        cos: Math.cos,
        sin: Math.sin,
        tan: Math.tan,
        max: Math.max,
        min: Math.min,
        sqrt: Math.sqrt,
        pow: Math.pow,
        PI: Math.PI,
        random: Math.random,
        floor: Math.floor,
        ceil: Math.ceil,
        round: Math.round,
      },
    };

    const vm = new VM({
      timeout: 10, // Very short timeout for per-frame execution
      sandbox,
      compiler: "javascript",
      eval: false,
      wasm: false,
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
  isMaliciousCode,
};
