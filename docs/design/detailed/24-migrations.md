# 24マイグレーション順序

## スコープ

node-pg-migrateで管理するDBマイグレーションファイルの順序、命名規約、トランザクション境界、ロールバックポリシー、`migrate-dryrun` CIゲートの実行内容を集約する。

## 命名規約

- ファイル名: `<14桁unix秒>_<snake_case_summary>.sql`
- 1ファイル1論理マイグレーション、1トランザクション
- 全マイグレーションは冪等性を持つ(`CREATE TABLE IF NOT EXISTS` ではなく `IF NOT EXISTS` を使わずタイムスタンプ管理に委ねる)
- `up` と `down` の双方を書く(`down` が不可能な操作はその旨をコメントで明記)

## マイグレーション順序リスト

| 順  | ファイル名                              | 内容                                                                                  | 所有章 |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| 1   | `1700000010_users.sql`                  | `users` テーブル+UNIQUE(email)                                                        | 01     |
| 2   | `1700000020_user_roles.sql`             | `user_roles` テーブル+partial unique index                                            | 12     |
| 3   | `1700000030_documents.sql`              | `documents` テーブル                                                                  | 11     |
| 4   | `1700000040_document_permissions.sql`   | `document_permissions` テーブル                                                       | 11     |
| 5   | `1700000050_share_links.sql`            | `share_links` テーブル+CHECK制約(expires within 30 days)                              | 09     |
| 6   | `1700000060_guest_sessions.sql`         | `guest_sessions` テーブル                                                             | 09     |
| 7   | `1700000070_revisions.sql`              | `revisions` テーブル+CHECK制約(explicit needs payload)                                | 06     |
| 8   | `1700000080_archived_ops.sql`           | `archived_ops` テーブル                                                               | 06     |
| 9   | `1700000090_comments.sql`               | `comments` テーブル+CHECK制約(author xor)                                             | 05b    |
| 10  | `1700000100_comment_replies.sql`        | `comment_replies` テーブル                                                            | 05b    |
| 11  | `1700000110_suggestions.sql`            | `suggestions` テーブル+CHECK制約(applied_version only when accepted、delta size 64KB) | 05     |
| 12  | `1700000120_images.sql`                 | `images` テーブル+CHECK制約(byte_size ≤ 10MiB、mime_type enum)                        | 08     |
| 13  | `1700000130_image_purge_queue.sql`      | `image_purge_queue` テーブル+UNIQUE(storage_key, original_image_id)                   | 08     |
| 14  | `1700000140_export_jobs.sql`            | `export_jobs` テーブル+CHECK制約(worker_id only running、attempt_count 0-3)           | 07     |
| 15  | `1700000150_audit_logs.sql`             | `audit_logs` テーブル+CHECK制約(actor_kind exclusion)                                 | 14     |
| 16  | `1700000160_secret_versions.sql`        | `secret_versions` テーブル+GENERATED expires_at                                       | 14     |
| 17  | `1700000170_ack_seq_snapshots.sql`      | `ack_seq_snapshots` テーブル+UNIQUE(document_id, user_or_guest, client_session_id)    | 04     |
| 18  | `1700000180_password_resets.sql`        | `password_resets` テーブル+部分UNIQUE(WHERE used_at IS NULL)                          | 03     |
| 19  | `1700000190_sharedb_schema.sql`         | `sharedb` schema + `ops`/`snapshots` テーブル(sharedb-postgres 6系要求)               | 06     |
| 20  | `1700000200_audit_trigger_function.sql` | advisory lock関数とseq採番ヘルパ関数                                                  | 14     |
| 21  | `1700000210_seed_initial_secrets.sql`   | `AUDIT_HASH_SALT_v1` 等の初回salt_version行(本番は手動投入)                           | 14     |

## 順序の依存ルール

- 後続マイグレーションは前順序のテーブルへFK参照を持ち得る。
- `users` を持たないマイグレーションは存在しない(全FK参照の根)。
- `documents` → 他多数の依存。`share_links` → `guest_sessions`。`revisions` → `archived_ops`。
- `audit_logs` は全章から書き込まれるため独立(参照側がFKを持たない設計、target_idは識別子のみ)。

## トランザクション境界規約

- 各マイグレーションは1トランザクション。
- `CREATE INDEX CONCURRENTLY` を使う場合はトランザクション分割が必要なため、対象マイグレーションのヘッダコメントに `-- @no-transaction` を記載しnode-pg-migrateにトランザクションを張らせない。
- 本MVPでは `CREATE INDEX CONCURRENTLY` は使わない(初回は空テーブルへの作成のため通常INDEXで十分)。

## ロールバックポリシー

- `down` は前順序の状態へ完全に戻す(`DROP TABLE` 等)。
- データ移行を含む将来のマイグレーションでは、`down` で復旧不能となる場合は冒頭に `-- DOWN NOT SUPPORTED: <理由>` をコメントし、`down` 関数で `RAISE EXCEPTION` を発生させる。
- 本MVPの初期マイグレーション群はすべて `down` 可能。

## `migrate-dryrun` の実装契約

`pnpm migrate:dry`(詳細18 CIジョブ1b)は以下を順に検証する。

1. 全マイグレーションファイルのSQL構文を `EXPLAIN` または `BEGIN; <SQL>; ROLLBACK` で検証。
2. ファイル名のタイムスタンプが厳密に昇順であることを検証(重複・逆順を検出)。
3. 各 `down` が `up` の逆操作になっていることを検証(`up` 実行→`down` 実行→対象スキーマが元の状態か比較)。
4. `audit_logs` テーブルが必ず全マイグレーションの中に存在することを検証(NFR-05保証のため)。

`tools/migrate.mjs` の最小骨格

```mjs
#!/usr/bin/env node
import { runner } from "node-pg-migrate";
import { loadEnv } from "../apps/server/src/config/env.js";

const env = loadEnv();
const mode = process.argv[2]; // 'up' | 'down' | 'dry'

await runner({
  databaseUrl: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: env.DB_SSL_MODE === "require" ? { rejectUnauthorized: true } : false,
  },
  dir: "migrations",
  migrationsTable: "pgmigrations",
  direction: mode === "down" ? "down" : "up",
  dryRun: mode === "dry",
  verbose: true,
  noLock: false,
  singleTransaction: false,
});
```

## サンプルマイグレーション本文

`migrations/1700000110_suggestions.sql`(提案テーブル例)

```sql
-- up
CREATE TABLE suggestions (
  id              UUID PRIMARY KEY,
  document_id     UUID NOT NULL REFERENCES documents(id),
  author_id       UUID NOT NULL REFERENCES users(id),
  base_version    BIGINT NOT NULL,
  delta           JSONB NOT NULL,
  status          TEXT NOT NULL
                  CHECK (status IN ('pending','accepting','accepted','rejected','stale','expired')),
  applied_version BIGINT,
  optimistic_version BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_changed_at TIMESTAMPTZ,
  status_changed_by UUID REFERENCES users(id),
  CONSTRAINT applied_version_only_when_accepted
    CHECK ((status='accepted' AND applied_version IS NOT NULL)
        OR (status<>'accepted' AND applied_version IS NULL)),
  CONSTRAINT delta_size_64kb CHECK (octet_length(delta::text) <= 65536)
);
CREATE INDEX idx_suggestions_hot ON suggestions(document_id, status, created_at DESC);
CREATE INDEX idx_suggestions_rebase ON suggestions(document_id, status, base_version);

-- down
DROP INDEX IF EXISTS idx_suggestions_rebase;
DROP INDEX IF EXISTS idx_suggestions_hot;
DROP TABLE IF EXISTS suggestions;
```

## エラーコード

| コード    | CIステータス | 意味                              |
| --------- | ------------ | --------------------------------- |
| `MIG-001` | failure      | マイグレーションSQL構文エラー     |
| `MIG-002` | failure      | ファイル名タイムスタンプ昇順違反  |
| `MIG-003` | failure      | `down` で `up` を逆転できない     |
| `MIG-004` | failure      | `audit_logs` マイグレーション欠落 |

## テストID紐付け

| 契約ID          | 内容                                   | テストID  | テスト種別 | CIゲート                    |
| --------------- | -------------------------------------- | --------- | ---------- | --------------------------- |
| MIG-CONTRACT-01 | 全マイグレーションが順序付きで実行可能 | T-MIG-001 | integ      | `migrate-dryrun`            |
| MIG-CONTRACT-02 | up→downで初期状態に戻る                | T-MIG-002 | integ      | `migrate-dryrun`            |
| MIG-CONTRACT-03 | 不正SQLで失敗                          | T-MIG-003 | meta       | `migrate-dryrun` 自己テスト |
| MIG-CONTRACT-04 | audit_logsが必ず作成される             | T-MIG-004 | integ      | `migrate-dryrun`            |

## トレーサビリティ

| 対応要件                                     | 対応基本設計節 | 対応ADR                      |
| -------------------------------------------- | -------------- | ---------------------------- |
| NFR-04(スキーマ管理)、NFR-10(migrate-dryrun) | §3、§11        | ADR-0004、ADR-0014、ADR-0025 |
