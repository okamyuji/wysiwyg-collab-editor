#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const sql = `
INSERT INTO secret_versions(id, secret_name, version, key_material)
VALUES (gen_random_uuid(), 'AUDIT_HASH_SALT', 1, decode('${"00".repeat(32)}', 'hex'))
ON CONFLICT DO NOTHING;

INSERT INTO users(id, email, password_hash, display_name, color_hex, locale, email_verified_at)
VALUES
  ('00000000-0000-7000-0000-000000000001', 'alice@example.com', 'local-seed-password-hash-placeholder', 'Alice', '#1565c0', 'ja', now()),
  ('00000000-0000-7000-0000-000000000002', 'ops@example.com', 'local-seed-password-hash-placeholder', 'Ops', '#2e7d32', 'ja', now()),
  ('00000000-0000-7000-0000-000000000003', 'cs@example.com', 'local-seed-password-hash-placeholder', 'CS', '#6a1b9a', 'ja', now())
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles(id, user_id, role, granted_at, granted_by)
VALUES
  (gen_random_uuid(), '00000000-0000-7000-0000-000000000001', 'standard', now(), '00000000-0000-7000-0000-000000000001'),
  (gen_random_uuid(), '00000000-0000-7000-0000-000000000002', 'standard', now(), '00000000-0000-7000-0000-000000000002'),
  (gen_random_uuid(), '00000000-0000-7000-0000-000000000002', 'operations_admin', now(), '00000000-0000-7000-0000-000000000002'),
  (gen_random_uuid(), '00000000-0000-7000-0000-000000000003', 'standard', now(), '00000000-0000-7000-0000-000000000003'),
  (gen_random_uuid(), '00000000-0000-7000-0000-000000000003', 'cs_admin', now(), '00000000-0000-7000-0000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO documents(id, owner_id, title, sharedb_collection, sharedb_doc_id)
VALUES ('00000000-0000-7000-0000-0000000000a1', '00000000-0000-7000-0000-000000000001', 'Welcome Document', 'documents', '00000000-0000-7000-0000-0000000000a1')
ON CONFLICT DO NOTHING;

INSERT INTO document_permissions(document_id, user_id, permission_level)
VALUES ('00000000-0000-7000-0000-0000000000a1', '00000000-0000-7000-0000-000000000001', 'owner')
ON CONFLICT DO NOTHING;
`;

const result = spawnSync("psql", ["-v", "ON_ERROR_STOP=1"], {
  input: sql,
  stdio: ["pipe", "inherit", "inherit"],
  env: {
    ...process.env,
    PGHOST: process.env.DB_HOST ?? process.env.PGHOST ?? "localhost",
    PGPORT: process.env.DB_PORT ?? process.env.PGPORT ?? "5432",
    PGDATABASE: process.env.DB_NAME ?? process.env.PGDATABASE ?? "wysiwyg_collab",
    PGUSER: process.env.DB_USER ?? process.env.PGUSER ?? "wysiwyg",
    PGPASSWORD: process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? "wysiwyg",
  },
});

if (result.error?.code === "ENOENT") {
  console.error("psql is required for seed-local");
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("seed done");
