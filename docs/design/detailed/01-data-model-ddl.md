# 01データモデル所有マップ

## スコープ

各業務テーブルの所有章を一元管理する目次である。DDL本体は各ドメイン章に置く。本章は所有マップと依存方向の一覧のみ持つ。

## テーブル所有マップ

| テーブル               | 所有章                                                            | 主な参照元                 |
| ---------------------- | ----------------------------------------------------------------- | -------------------------- |
| `users`                | (基盤層、本章)                                                    | 全章                       |
| `user_roles`           | [12サポート運用範囲](./12-support-cs-operations.md)               | 03、12                     |
| `documents`            | [11文書ライフサイクル](./11-document-lifecycle.md)                | 04、05、06、07、08、09、10 |
| `document_permissions` | [11文書ライフサイクル](./11-document-lifecycle.md)                | 03、09、11、12             |
| `share_links`          | [09共有リンクとゲストセッション](./09-share-link-and-guest.md)    | 03、11、12                 |
| `guest_sessions`       | [09共有リンクとゲストセッション](./09-share-link-and-guest.md)    | 03、09、14                 |
| `revisions`            | [06版作成とops圧縮](./06-version-and-ops-compaction.md)           | 06、11                     |
| `archived_ops`         | [06版作成とops圧縮](./06-version-and-ops-compaction.md)           | 06、11                     |
| `comments`             | [05bコメント追加](./05b-comments.md)                              | 11                         |
| `comment_replies`      | [05bコメント追加](./05b-comments.md)                              | 11                         |
| `suggestions`          | [05提案モード二段CAS](./05-suggestion-two-phase-cas.md)           | 11                         |
| `images`               | [08画像アップロードと自動削除キュー](./08-image-and-purge.md)     | 11                         |
| `image_purge_queue`    | [08画像アップロードと自動削除キュー](./08-image-and-purge.md)     | 11                         |
| `export_jobs`          | [07エクスポートパイプライン](./07-export-pipeline.md)             | 11                         |
| `audit_logs`           | [14監査ログとハッシュチェーン](./14-audit-log-hash-chain.md)      | 全章                       |
| `secret_versions`      | [14監査ログとハッシュチェーン](./14-audit-log-hash-chain.md)      | 12、14                     |
| `ack_seq_snapshots`    | [04 OT変換規則と再接続プロトコル](./04-realtime-ot-resilience.md) | 04、11                     |
| `password_resets`      | [03認証セッションCSRF](./03-auth-session-csrf.md)                 | 03                         |

## 基盤層DDL(本章所有)

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  color_hex       TEXT NOT NULL DEFAULT '#1565c0',
  avatar_url      TEXT,
  locale          TEXT NOT NULL DEFAULT 'ja' CHECK (locale IN ('ja','en')),
  last_login_at   TIMESTAMPTZ,
  locked_until    TIMESTAMPTZ,
  login_failure_count SMALLINT NOT NULL DEFAULT 0,
  email_verified_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_users_email ON users(email);

CREATE TABLE document_permissions (
  document_id      UUID NOT NULL REFERENCES documents(id),
  user_id          UUID NOT NULL REFERENCES users(id),
  permission_level TEXT NOT NULL CHECK (permission_level IN ('owner','editor','commenter','viewer')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, user_id)
);
CREATE INDEX idx_perm_user ON document_permissions(user_id, permission_level);
CREATE INDEX idx_perm_doc  ON document_permissions(document_id, permission_level);
```

`document_permissions` は概念上[11文書ライフサイクル](./11-document-lifecycle.md)に所有させるが、`users` への外部キーは基盤層配置のためここに記載した(運用上の所有はDocライフサイクル章)。

## ShareDBスキーマ(`sharedb` スキーマ)

| テーブル    | 用途                         |
| ----------- | ---------------------------- |
| `ops`       | 各文書の操作履歴             |
| `snapshots` | 各文書の最新スナップショット |

具体的なカラム定義はShareDB Postgres Adapterのバージョンに依存するため、本章では参照のみとし、詳細は[06版作成とops圧縮](./06-version-and-ops-compaction.md)で確定する。

## 依存方向の禁則

- 基盤層テーブル(`users`, `audit_logs`, `secret_versions`)は他層を参照しない。
- ドメイン層テーブル相互の直接FK参照は最小化する(例: `comments` は `documents` を参照するが `suggestions` は参照しない)。
- 章間連携はAPIまたはイベント(audit_logs追記、ShareDB pub/sub、キュー)経由のみ。

## トレーサビリティ

| 対応要件       | 対応基本設計節                 | 対応ADR            |
| -------------- | ------------------------------ | ------------------ |
| 全FR/NFRの背骨 | §3.1、§3.2、§3.3、§3.4 ShareDB | ADR-0004、ADR-0014 |
