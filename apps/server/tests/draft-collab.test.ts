import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { attachDraftCollab, createApp } from "../src/main.js";

type AnyMessage = {
  type: string;
  count?: number;
  data?: unknown;
};

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server!.close((error) => (error ? reject(error) : resolve()));
    server = undefined;
  });
});

async function startServer() {
  const httpServer = createServer(createApp());
  attachDraftCollab(httpServer, { heartbeatIntervalMs: 50 });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address() as AddressInfo;
  server = httpServer;
  return `ws://127.0.0.1:${address.port}/ws/draft`;
}

function openClient(url: string) {
  const ws = new WebSocket(url);
  const messages: AnyMessage[] = [];
  ws.on("message", (raw) => {
    messages.push(JSON.parse(raw.toString()) as AnyMessage);
  });
  return new Promise<{ ws: WebSocket; messages: AnyMessage[] }>((resolve, reject) => {
    ws.once("open", () => resolve({ ws, messages }));
    ws.once("error", reject);
  });
}

function waitFor<T>(probe: () => T | undefined, timeoutMs = 1_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      const value = probe();
      if (value !== undefined) return resolve(value);
      if (Date.now() - startedAt > timeoutMs) return reject(new Error("waitFor timeout"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

function closeQuiet(ws: WebSocket) {
  return new Promise<void>((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.once("close", () => resolve());
    ws.close();
  });
}

describe("draft collab websocket", () => {
  test("relays draft updates between two clients without echoing to the sender", async () => {
    const url = await startServer();
    const a = await openClient(url);
    const b = await openClient(url);

    a.ws.send(JSON.stringify({ type: "draft", data: { title: "t", bodyHtml: "<p>x</p>", revision: 7 } }));

    const relayed = await waitFor(() => b.messages.find((m) => m.type === "draft"));
    expect(relayed.data).toMatchObject({ title: "t", bodyHtml: "<p>x</p>", revision: 7 });
    expect(a.messages.find((m) => m.type === "draft")).toBeUndefined();

    await Promise.all([closeQuiet(a.ws), closeQuiet(b.ws)]);
  });

  test("reports presence count as peers connect and disconnect", async () => {
    const url = await startServer();
    const a = await openClient(url);
    await waitFor(() => a.messages.find((m) => m.type === "presence" && m.count === 1));

    const b = await openClient(url);
    await waitFor(() => a.messages.find((m) => m.type === "presence" && m.count === 2));

    await closeQuiet(b.ws);
    await waitFor(() => a.messages.filter((m) => m.type === "presence").pop()?.count === 1 ? true : undefined);

    await closeQuiet(a.ws);
  });

  test("late joiners receive the latest snapshot", async () => {
    const url = await startServer();
    const a = await openClient(url);
    a.ws.send(JSON.stringify({ type: "draft", data: { title: "snap", bodyHtml: "<p>s</p>", revision: 42 } }));
    // Allow the server to receive and store the latest draft.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const b = await openClient(url);
    const snapshot = await waitFor(() => b.messages.find((m) => m.type === "snapshot"));
    expect(snapshot.data).toMatchObject({ title: "snap", bodyHtml: "<p>s</p>", revision: 42 });

    await Promise.all([closeQuiet(a.ws), closeQuiet(b.ws)]);
  });

  test("does not destroy upgrades on unknown paths so coexisting handlers (Vite HMR) keep working", async () => {
    // Regression: destroying every non-matching upgrade killed Vite's HMR
    // connection and triggered an infinite full-reload loop. The handler must
    // leave foreign upgrades alone for other listeners to claim.
    const httpServer = createServer(createApp());
    attachDraftCollab(httpServer, { heartbeatIntervalMs: 50 });

    let claimed = false;
    httpServer.on("upgrade", (req, socket) => {
      if (req.url === "/__vite_hmr") {
        claimed = true;
        socket.write("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        socket.end();
      }
    });

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address() as AddressInfo;
    server = httpServer;

    const probe = new WebSocket(`ws://127.0.0.1:${address.port}/__vite_hmr`);
    await new Promise<void>((resolve) => {
      probe.once("error", () => resolve());
      probe.once("close", () => resolve());
    });
    expect(claimed).toBe(true);
  });

  test("comments propagate to all peers including the sender (echo) and survive concurrent draft updates", async () => {
    // Regression: comments USED to ride on DraftState. A second peer's draft
    // broadcast (with no comments yet) would overwrite the first peer's
    // additions via last-write-wins. Comments now live in their own
    // append-only event stream keyed by id.
    const url = await startServer();
    const a = await openClient(url);
    const b = await openClient(url);

    const c1 = { id: "c1", text: "looks good", createdAt: 1_700_000_000_000 };
    a.ws.send(JSON.stringify({ type: "comment", data: c1 }));

    // B writes an unrelated draft update WITHOUT mentioning comments — must
    // not erase A's comment from the room.
    b.ws.send(
      JSON.stringify({ type: "draft", data: { title: "t", bodyHtml: "<p>b</p>", revision: 50 } }),
    );

    await waitFor(() => b.messages.find((m) => m.type === "comment"));
    // A also gets an echo so its optimistic append is reconciled by id.
    await waitFor(() => a.messages.find((m) => m.type === "comment"));

    // A new joiner pulls down the full comment log on connect.
    const c = await openClient(url);
    const snapshot = await waitFor(() => c.messages.find((m) => m.type === "comments"));
    expect(snapshot.data).toEqual([c1]);

    await Promise.all([closeQuiet(a.ws), closeQuiet(b.ws), closeQuiet(c.ws)]);
  });

  test("de-duplicates comments by id (idempotent re-send)", async () => {
    const url = await startServer();
    const a = await openClient(url);
    const b = await openClient(url);

    const c1 = { id: "dup", text: "once", createdAt: 1_700_000_000_000 };
    a.ws.send(JSON.stringify({ type: "comment", data: c1 }));
    a.ws.send(JSON.stringify({ type: "comment", data: { ...c1, text: "second attempt" } }));

    await waitFor(() => b.messages.find((m) => m.type === "comment"));
    // Settle to make sure no second broadcast came through.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const commentMsgs = b.messages.filter((m) => m.type === "comment");
    expect(commentMsgs).toHaveLength(1);
    expect(commentMsgs[0]?.data).toEqual(c1);

    await Promise.all([closeQuiet(a.ws), closeQuiet(b.ws)]);
  });

  test("drops malformed comment payloads", async () => {
    const url = await startServer();
    const a = await openClient(url);
    const b = await openClient(url);

    a.ws.send(JSON.stringify({ type: "comment", data: null }));
    a.ws.send(JSON.stringify({ type: "comment", data: { id: "", text: "no id", createdAt: 1 } }));
    a.ws.send(JSON.stringify({ type: "comment", data: { id: "ok", text: "   ", createdAt: 1 } }));
    a.ws.send(JSON.stringify({ type: "comment", data: { id: "ok2", text: "kept", createdAt: 1_700_000_000_010 } }));

    const relayed = await waitFor(() => b.messages.find((m) => m.type === "comment"));
    expect(relayed.data).toEqual({ id: "ok2", text: "kept", createdAt: 1_700_000_000_010 });

    await Promise.all([closeQuiet(a.ws), closeQuiet(b.ws)]);
  });

  test("ignores malformed messages without dropping the connection", async () => {
    const url = await startServer();
    const a = await openClient(url);
    const b = await openClient(url);

    a.ws.send("not json");
    a.ws.send(JSON.stringify({ type: "draft" }));
    a.ws.send(JSON.stringify({ type: "draft", data: { title: 1, bodyHtml: "<p/>", revision: 2 } }));
    a.ws.send(JSON.stringify({ type: "draft", data: { title: "ok", bodyHtml: "<p>ok</p>", revision: 99 } }));

    const relayed = await waitFor(() => b.messages.find((m) => m.type === "draft"));
    expect((relayed.data as { title?: string }).title).toBe("ok");
    expect(a.ws.readyState).toBe(WebSocket.OPEN);

    await Promise.all([closeQuiet(a.ws), closeQuiet(b.ws)]);
  });
});
