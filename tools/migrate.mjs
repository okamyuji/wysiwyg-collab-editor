#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const mode = process.argv[2] ?? "dry";
const migrationsDir = new URL("../migrations/", import.meta.url);
const files = readdirSync(migrationsDir)
  .filter((file) => /^\d{10,14}_[a-z0-9_]+\.sql$/.test(file))
  .sort();

function fail(code, message) {
  console.error(`${code}: ${message}`);
  process.exit(1);
}

// Index-based parser instead of `new RegExp(`-- ${name}...`)` so a malicious or
// typo'd CLI mode can never inject regex metacharacters (CodeQL js/regex-injection).
const SECTION_NAMES = new Set(["up", "down"]);
function section(sql, name) {
  if (!SECTION_NAMES.has(name)) return undefined;
  const marker = `-- ${name}\n`;
  const start = sql.indexOf(marker);
  if (start === -1) return undefined;
  const bodyStart = start + marker.length;
  const candidates = ["\n-- up\n", "\n-- down\n"]
    .map((m) => sql.indexOf(m, bodyStart))
    .filter((i) => i !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : sql.length;
  return sql.slice(bodyStart, end).trim();
}

function validate() {
  let previous = "";
  for (const file of files) {
    const timestamp = file.split("_")[0];
    if (timestamp <= previous) fail("MIG-002", `timestamp is not strictly ascending: ${file}`);
    previous = timestamp;

    const sql = readFileSync(new URL(file, migrationsDir), "utf8");
    if (!section(sql, "up")) fail("MIG-001", `missing -- up section: ${file}`);
    if (!section(sql, "down")) fail("MIG-003", `missing -- down section: ${file}`);
  }

  if (!files.includes("1700000150_audit_logs.sql")) {
    fail("MIG-004", "audit_logs migration is missing");
  }
}

function psql(sql) {
  const args = ["-v", "ON_ERROR_STOP=1"];
  if (process.env.DATABASE_URL) args.push(process.env.DATABASE_URL);
  const result = spawnSync("psql", args, {
    input: sql,
    stdio: ["pipe", "inherit", "inherit"],
    env: {
      ...process.env,
      PGHOST: process.env.DB_HOST ?? process.env.PGHOST,
      PGPORT: process.env.DB_PORT ?? process.env.PGPORT,
      PGDATABASE: process.env.DB_NAME ?? process.env.PGDATABASE,
      PGUSER: process.env.DB_USER ?? process.env.PGUSER,
      PGPASSWORD: process.env.DB_PASSWORD ?? process.env.PGPASSWORD,
    },
  });
  if (result.error?.code === "ENOENT") fail("MIG-001", "psql is required for database execution");
  if (result.status !== 0) fail("MIG-001", "psql execution failed");
}

validate();

if (mode === "dry") {
  console.log(`migrate dry OK (${files.length} files)`);
} else if (mode === "up" || mode === "down") {
  const ordered = mode === "up" ? files : [...files].reverse();
  const body = ordered
    .map((file) => section(readFileSync(new URL(file, migrationsDir), "utf8"), mode))
    .join("\n\n");
  psql(`BEGIN;\n${body}\nCOMMIT;\n`);
} else {
  fail("MIG-001", `unknown mode: ${mode}`);
}
