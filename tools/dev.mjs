#!/usr/bin/env node
// Parallel dev runner with graceful SIGINT/SIGTERM forwarding.
// Replaces `vite & server` (which leaks the background process on Ctrl+C) and
// `pnpm --parallel run dev` (which surfaces SIGINT-killed children as failures).
import { spawn } from "node:child_process";

const apps = [
  {
    label: "web",
    cwd: "apps/web",
    cmd: "pnpm",
    args: ["exec", "vite", "--host", "0.0.0.0", "--port", "5173"],
  },
  {
    label: "server",
    cwd: "apps/server",
    cmd: "pnpm",
    args: ["exec", "tsx", "watch", "src/main.ts"],
  },
];

const colors = { web: "\x1b[35m", server: "\x1b[36m" };
const reset = "\x1b[0m";

let shuttingDown = false;
let userInitiatedShutdown = false;
let finalExitCode = 0;

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
  // spawn() emits `error` async when the binary is missing or cwd is invalid.
  // Without a listener Node would crash the parent before the sibling child is
  // cleaned up; instead, log and trigger the same shutdown path.
  child.on("error", (err) => {
    process.stderr.write(`[dev] ${app.label} failed to start: ${err.message}\n`);
    if (!shuttingDown) {
      finalExitCode = 1;
      shutdown("SIGTERM");
    }
  });
  return { app, child };
});

function shutdown(signal, initiatedByUser = false) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (initiatedByUser) userInitiatedShutdown = true;
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
}

process.on("SIGINT", () => shutdown("SIGINT", true));
process.on("SIGTERM", () => shutdown("SIGTERM", true));

let exited = 0;
for (const { app, child } of children) {
  child.on("exit", (code, signal) => {
    exited += 1;
    process.stdout.write(
      `[dev] ${app.label} exited (code=${code ?? "null"} signal=${signal ?? "null"})\n`,
    );
    if (!shuttingDown) {
      // First child to die unexpectedly takes the rest down and the runner
      // exits non-zero so CI/test harnesses see the failure.
      finalExitCode = code && code !== 0 ? code : 1;
      shutdown("SIGTERM");
    }
    if (exited === children.length) {
      process.exit(userInitiatedShutdown ? 0 : finalExitCode);
    }
  });
}
