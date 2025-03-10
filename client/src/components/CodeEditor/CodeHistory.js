import React from "react";
import "./CodeHistory.css";

function CodeHistory({ codeHistory }) {
  // Format timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="code-history">
      <div className="history-header">
        <h3>Code History</h3>
      </div>

      <div className="history-list">
        {codeHistory.length === 0 ? (
          <div className="empty-history">
            <p>No code has been submitted yet.</p>
            <p>Write and propose code to see it appear here!</p>
          </div>
        ) : (
          codeHistory
            .slice()
            .reverse()
            .map((entry) => (
              <div key={entry.id} className="history-item">
                <div className="history-item-header">
                  <span className="player-name">{entry.playerName}</span>
                  <span className="timestamp">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>

                {(entry.upvotes !== undefined ||
                  entry.downvotes !== undefined) && (
                  <div className="vote-results">
                    <span className="votes upvotes">
                      <span className="vote-icon">✓</span> {entry.upvotes || 0}
                    </span>
                    <span className="votes downvotes">
                      <span className="vote-icon">✗</span>{" "}
                      {entry.downvotes || 0}
                    </span>
                  </div>
                )}

                <pre className="code-preview">{entry.code}</pre>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

export default CodeHistory;
