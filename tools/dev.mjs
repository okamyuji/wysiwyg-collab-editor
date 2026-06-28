#!/usr/bin/env node
// Parallel dev runner with graceful SIGINT/SIGTERM forwarding.
// Replaces `vite & server` (which leaks the background process on Ctrl+C) and
// `pnpm --parallel run dev` (which surfaces SIGINT-killed children as failures).
import { spawn } from "node:child_process";

const apps = [
  { label: "web", cwd: "apps/web", cmd: "pnpm", args: ["exec", "vite", "--host", "0.0.0.0", "--port", "5173"] },
  { label: "server", cwd: "apps/server", cmd: "pnpm", args: ["exec", "tsx", "watch", "src/main.ts"] },
];

const colors = { web: "\x1b[35m", server: "\x1b[36m" };
const reset = "\x1b[0m";

const children = apps.map((app) => {
  const child = spawn(app.cmd, app.args, {
    cwd: app.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  const prefix = `${colors[app.label] ?? ""}[${app.label}]${reset} `;
  const pipe = (stream, target) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) target.write(`${prefix}${line}\n`);
    });
    stream.on("end", () => {
      if (buffer) target.write(`${prefix}${buffer}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return { app, child };
});

let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`\n[dev] ${signal} received, stopping ${children.length} processes...\n`);
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill(signal);
      } catch {
        // child already exited
      }
    }
  }
  // Hard-exit fallback if a child ignores the signal.
  setTimeout(() => {
    for (const { app, child } of children) {
      if (child.exitCode === null) {
        process.stderr.write(`[dev] ${app.label} did not exit, force killing\n`);
        try {
          child.kill("SIGKILL");
        } catch {
          // already gone
        }
      }
    }
  }, 5000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

let exited = 0;
for (const { app, child } of children) {
  child.on("exit", (code, signal) => {
    exited += 1;
    process.stdout.write(`[dev] ${app.label} exited (code=${code ?? "null"} signal=${signal ?? "null"})\n`);
    if (!shuttingDown) {
      // First child to die unexpectedly takes the rest down.
      shutdown("SIGTERM");
    }
    if (exited === children.length) {
      // Exit cleanly when a user-initiated shutdown drains both children.
      process.exit(shuttingDown ? 0 : code ?? 0);
    }
  });
}
