# 30ローカル開発手順

## スコープ

`docker-compose.yml`、シードスクリプト、ローカル起動手順、テスト実行手順、トラブルシューティングを集約する。新規参加者が `git clone` から `pnpm dev` 起動まで30分以内で到達できる粒度とする。

## `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: wysiwyg
      POSTGRES_PASSWORD: wysiwyg
      POSTGRES_DB: wysiwyg_collab
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wysiwyg"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:8-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio:RELEASE.2025-10-15T17-29-55Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio: { condition: service_healthy }
    entrypoint: >
      sh -c "
      mc alias set local http://minio:9000 minioadmin minioadmin &&
      mc mb --ignore-existing local/docs-images &&
      mc mb --ignore-existing local/docs-exports &&
      mc anonymous set download local/docs-images &&
      echo 'minio init done'
      "

  mailcatcher:
    image: schickling/mailcatcher
    ports:
      - "1025:1025"
      - "1080:1080"

volumes:
  pgdata:
  miniodata:
```

## 起動手順

```sh
# 1. 依存ツール
brew install pnpm node@24 docker

# 2. リポジトリclone後
cp .env.example .env
# .env の SESSION_SECRET 等は openssl rand -base64 32 で生成して書き換える

# 3. インフラ起動
docker compose up -d

# 4. マイグレーション
pnpm install
pnpm migrate up

# 5. 初期シード(テストユーザー、文書)
pnpm seed:local

# 6. アプリ起動
pnpm dev
# apps/web: http://localhost:5173
# apps/server: http://localhost:3000
# MinIO console: http://localhost:9001 (minioadmin/minioadmin)
# MailCatcher: http://localhost:1080
```

## `tools/seed-local.mjs` 骨格

```mjs
#!/usr/bin/env node
import { Pool } from "pg";
import crypto from "node:crypto";
import argon2 from "argon2";
import { loadEnv } from "../apps/server/dist/config/env.js";

const env = loadEnv();
const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});

const USERS = [
  {
    id: "00000000-0000-7000-0000-000000000001",
    email: "alice@example.com",
    name: "Alice",
    password: "alice-strong-password-1!",
    roles: ["standard"],
  },
  {
    id: "00000000-0000-7000-0000-000000000002",
    email: "ops@example.com",
    name: "Ops",
    password: "ops-strong-password-1!",
    roles: ["standard", "operations_admin"],
  },
  {
    id: "00000000-0000-7000-0000-000000000003",
    email: "cs@example.com",
    name: "CS",
    password: "cs-strong-password-1!",
    roles: ["standard", "cs_admin"],
  },
];

async function upsertUser(u) {
  const hash = await argon2.hash(u.password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await pool.query(
    `INSERT INTO users(id, email, password_hash, display_name, color_hex, locale, email_verified_at)
     VALUES ($1,$2,$3,$4,'#1565c0','ja',now())
     ON CONFLICT (email) DO NOTHING`,
    [u.id, u.email, hash, u.name],
  );
  for (const r of u.roles) {
    await pool.query(
      `INSERT INTO user_roles(id, user_id, role, granted_at, granted_by)
       VALUES (gen_random_uuid(), $1, $2, now(), $1)
       ON CONFLICT DO NOTHING`,
      [u.id, r],
    );
  }
}

async function initSecretVersions() {
  // ローカル開発用の初期salt(本番は別途投入)
  await pool.query(
    `INSERT INTO secret_versions(id, secret_name, version, key_material)
     VALUES (gen_random_uuid(), 'AUDIT_HASH_SALT', 1, decode('${"00".repeat(32)}', 'hex'))
     ON CONFLICT DO NOTHING`,
  );
}

async function main() {
  await initSecretVersions();
  for (const u of USERS) await upsertUser(u);

  // 文書1件(Alice所有)
  const docId = "00000000-0000-7000-0000-0000000000a1";
  await pool.query(
    `INSERT INTO documents(id, owner_id, title, sharedb_collection, sharedb_doc_id)
     VALUES ($1, $2, 'Welcome Document', 'documents', $1)
     ON CONFLICT DO NOTHING`,
    [docId, USERS[0].id],
  );
  await pool.query(
    `INSERT INTO document_permissions(document_id, user_id, permission_level)
     VALUES ($1, $2, 'owner')
     ON CONFLICT DO NOTHING`,
    [docId, USERS[0].id],
  );

  console.log("seed done");
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

## テスト実行

```sh
# unit + integ(全packages)
pnpm test

# unitのみ
pnpm --filter ./apps/server test --watch

# integのみ(testcontainers使用、Docker要)
pnpm --filter ./apps/server test tests/integ

# E2E
pnpm --filter ./e2e exec playwright test --ui

# カバレッジ
pnpm --filter ./apps/server test --coverage
```

## doclint(ローカル)

```sh
python3 tools/lint_docs.py docs/
python3 tools/auto_fix_docs.py docs/
node tools/traceability_check.mjs
```

## トラブルシューティング

| 症状                                        | 原因                                      | 対処                                                      |
| ------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| `pnpm install` で `EBADENGINE` 警告         | Nodeバージョン不一致                      | `.nvmrc` の `24` に合わせて `nvm use`                     |
| `pnpm migrate up` がhang                    | postgres健全性チェック未完                | `docker compose ps` で `healthy` 確認後に再実行           |
| `apps/server` 起動時 `ENV-001`              | `.env` の必須キー欠落                     | `.env.example` とdiffを取り欠落キーを追加                 |
| `pnpm dev` でport 5173衝突                  | 既存プロセス                              | `lsof -i :5173` で得たPIDを `kill -9 <PID>` で停止        |
| Playwright実行で `Executable doesn't exist` | ブラウザ未インストール                    | `pnpm --filter ./e2e exec playwright install --with-deps` |
| testcontainers起動失敗                      | Docker未起動またはDocker socket未マウント | Docker Desktop起動を確認                                  |
| MinIOバケットが見えない                     | 初期化未完                                | `docker compose run minio-init` を再実行                  |
| `pnpm audit` でHigh検出                     | 依存にCVE                                 | `pnpm up <pkg>` でminor上げ、不可ならADR起票              |

## エディタ設定推奨

- VS Code拡張: ESLint, Vite+ (VoidZero), GitLens, EditorConfig, Playwright Test for VSCode
- `.editorconfig`: `indent_style=space`, `indent_size=2`, `end_of_line=lf`, `charset=utf-8`, `trim_trailing_whitespace=true`, `insert_final_newline=true`

## トレーサビリティ

| 対応要件                   | 対応基本設計節 | 対応ADR  |
| -------------------------- | -------------- | -------- |
| NFR-07(運用)、NFR-10(品質) | §8、§9         | ADR-0028 |
