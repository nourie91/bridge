// ============================================================
// Bridge Server
//
// Connects Claude Code (HTTP) to Figma Plugin (WebSocket).
//
// Architecture:
//   Claude Code -> curl POST /command -> Server -> WebSocket -> Plugin UI -> Plugin Code -> Figma API
//                                                                        <- result <-
//
// Endpoints:
//   GET  /status   -> { connected: bool }
//   POST /command  -> { action: "...", ...params } -> { id, result } or { id, error }
//
// Usage:
//   node server/server.js
// ============================================================

const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.BRIDGE_PORT || 9001;

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

let pluginSocket = null;
const pendingCommands = new Map(); // id -> { resolve, reject, timer }

// ─────────────────────────────────────────────
// HTTP Server
// ─────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS headers (needed for local dev)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        connected: pluginSocket !== null,
        pendingCommands: pendingCommands.size,
      })
    );
    return;
  }

  // Execute command
  if (req.method === "POST" && req.url === "/command") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (!pluginSocket) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Figma plugin not connected. Open the Bridge plugin in Figma.",
          })
        );
        return;
      }

      let command;
      try {
        command = JSON.parse(body);
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON: " + e.message }));
        return;
      }

      // Generate unique ID
      const id =
        Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 6);
      command.id = id;

      // Create promise for the response
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingCommands.delete(id);
          reject(new Error("Timeout (30s) — plugin did not respond"));
        }, 30000);

        pendingCommands.set(id, { resolve, reject, timer });
      });

      // Send command to Figma plugin
      const commandStr = JSON.stringify(command);
      console.log(`  <- ${command.action}${command.nodeId ? ` (${command.nodeId})` : ""}`);
      pluginSocket.send(commandStr);

      // Wait for result and respond
      promise
        .then((result) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        })
        .catch((err) => {
          res.writeHead(504, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found. Use GET /status or POST /command" }));
});

// ─────────────────────────────────────────────
// WebSocket Server (for Figma plugin connection)
// ─────────────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  pluginSocket = ws;
  console.log("  Figma plugin connected");

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.id) {
        const pending = pendingCommands.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          pendingCommands.delete(msg.id);

          if (msg.error) {
            console.log(`  -> Error: ${msg.error}`);
          } else {
            console.log(`  -> OK`);
          }

          pending.resolve(msg);
        }
      }
    } catch (e) {
      console.error("  -> Parse error:", e.message);
    }
  });

  ws.on("close", () => {
    pluginSocket = null;
    console.log("  Figma plugin disconnected");

    // Reject all pending commands
    for (const [id, pending] of pendingCommands) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Plugin disconnected"));
    }
    pendingCommands.clear();
  });
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────

server.listen(PORT, () => {
  console.log("");
  console.log("  Bridge Server");
  console.log(`  http://localhost:${PORT}`);
  console.log("");
  console.log("  1. Open Figma > Plugins > Bridge for Claude Code");
  console.log("  2. The plugin will auto-connect here");
  console.log("  3. Claude Code can now send commands");
  console.log("");
  console.log("  Waiting for plugin connection...");
  console.log("");
});
