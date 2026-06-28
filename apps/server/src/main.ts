import http from "node:http";
import { pathToFileURL } from "node:url";
import express from "express";
import helmet from "helmet";
import { WebSocket, WebSocketServer } from "ws";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

type Comment = {
  id: string;
  text: string;
  createdAt: number;
};

type DraftState = {
  title: string;
  bodyHtml: string;
  revision: number;
};

type ClientMessage = { type?: string; data?: Record<string, unknown> };

function isComment(value: unknown): value is Comment {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    c.id.length > 0 &&
    typeof c.text === "string" &&
    c.text.trim().length > 0 &&
    typeof c.createdAt === "number" &&
    Number.isFinite(c.createdAt)
  );
}

function validateDraftPayload(data: Record<string, unknown>): DraftState | null {
  const { title, bodyHtml, revision } = data;
  if (typeof title !== "string" || typeof bodyHtml !== "string" || typeof revision !== "number") {
    return null;
  }
  return { title, bodyHtml, revision };
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/metrics", (_req, res) => {
    res.type("text/plain").send("# metrics scaffold\n");
  });

  return app;
}

// ponytail: single in-memory broadcast room, no persistence, no auth. Enough
// for cross-browser collab demo. Multi-doc rooms, auth, durable history belong
// to the full collab server when it ships.
export type AttachDraftCollabOptions = {
  heartbeatIntervalMs?: number;
  path?: string;
};

export function attachDraftCollab(server: http.Server, options: AttachDraftCollabOptions = {}) {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
  const path = options.path ?? "/ws/draft";
  const wss = new WebSocketServer({ noServer: true });
  const liveness = new WeakMap<WebSocket, boolean>();
  const peers = new Set<WebSocket>();
  let latest: DraftState | null = null;
  // ponytail: append-only comment log keyed by id. Comments must NOT live in
  // DraftState — last-write-wins on the draft would let a peer with an empty
  // comments array clobber another peer's additions. Treat each comment as
  // an immutable event instead.
  const commentsById = new Map<string, Comment>();

  function broadcast(payload: object, except?: WebSocket) {
    const data = JSON.stringify(payload);
    for (const peer of peers) {
      if (peer === except) continue;
      if (peer.readyState === WebSocket.OPEN) peer.send(data);
    }
  }

  function broadcastPresence() {
    broadcast({ type: "presence", count: peers.size });
  }

  server.on("upgrade", (req, socket, head) => {
    // ponytail: SHARING the http.Server with Vite's HMR means we MUST NOT
    // socket.destroy() upgrades for paths we don't own — that kills Vite's
    // own /__vite_hmr connection and triggers a full-reload loop in the
    // browser. Return silently and let other listeners (or Node's default)
    // handle non-matching upgrades.
    if (req.url !== path) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      peers.add(ws);
      liveness.set(ws, true);
      ws.send(JSON.stringify({ type: "presence", count: peers.size }));
      if (latest) ws.send(JSON.stringify({ type: "snapshot", data: latest }));
      if (commentsById.size > 0) {
        ws.send(JSON.stringify({ type: "comments", data: [...commentsById.values()] }));
      }
      broadcastPresence();

      ws.on("pong", () => {
        liveness.set(ws, true);
      });

      ws.on("message", (raw) => {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (!msg.data) return;
        if (msg.type === "draft") {
          const next = validateDraftPayload(msg.data);
          if (!next) return;
          if (!latest || next.revision > latest.revision) latest = next;
          broadcast({ type: "draft", data: next }, ws);
        } else if (msg.type === "comment") {
          if (!isComment(msg.data)) return;
          if (commentsById.has(msg.data.id)) return; // de-dup
          commentsById.set(msg.data.id, msg.data);
          // Echo back to sender too so its own append survives strict-mode
          // double-mount and any clobbering — append-only by id makes echoes
          // idempotent on the client.
          broadcast({ type: "comment", data: msg.data });
        }
      });

      // ws.on('error') alone leaks the peer set when a socket dies without
      // emitting close; explicitly remove on error to keep presence accurate.
      function cleanup() {
        if (peers.delete(ws)) broadcastPresence();
      }
      ws.on("close", cleanup);
      ws.on("error", cleanup);
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of peers) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (liveness.get(ws) === false) {
        // ponytail: terminate, not close. close() waits for a graceful FIN
        // from a peer that already stopped responding.
        ws.terminate();
        continue;
      }
      liveness.set(ws, false);
      ws.ping();
    }
  }, heartbeatIntervalMs);
  server.on("close", () => {
    clearInterval(heartbeat);
    wss.close();
  });

  return wss;
}

export function createCollabServer() {
  const app = createApp();
  const server = http.createServer(app);
  attachDraftCollab(server);
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  createCollabServer().listen(port, () => {
    console.info(`app-server listening on ${port}`);
  });
}
