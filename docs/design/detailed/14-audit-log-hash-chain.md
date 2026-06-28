# 14監査ログとハッシュチェーン

## スコープ

audit_logsとsecret_versionsのDDL、ハッシュチェーン算出仕様、`record_canonical` のキー集合、salt_version運用、advisory lock、検証バッチを集約する。

## 契約

### DDL(所有テーブル)

```sql
CREATE TABLE audit_logs (
  id                UUID PRIMARY KEY,
  seq               BIGINT NOT NULL UNIQUE,
  actor_kind        TEXT NOT NULL CHECK (actor_kind IN ('user','guest','system')),
  user_id           UUID REFERENCES users(id),
  guest_session_id  UUID REFERENCES guest_sessions(id),
  target_kind       TEXT NOT NULL,
  target_id         UUID,
  action            TEXT NOT NULL,
  ip_address_hash   BYTEA,
  user_agent        TEXT,
  payload           JSONB NOT NULL,
  salt_version      SMALLINT NOT NULL,
  prev_hash         BYTEA NOT NULL,
  entry_hash        BYTEA NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT actor_user_check
    CHECK ((actor_kind='user'   AND user_id IS NOT NULL AND guest_session_id IS NULL) OR
           (actor_kind='guest'  AND guest_session_id IS NOT NULL AND user_id IS NULL) OR
           (actor_kind='system' AND user_id IS NULL AND guest_session_id IS NULL))
);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_guest ON audit_logs(guest_session_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_logs(target_kind, target_id);
CREATE INDEX idx_audit_seq ON audit_logs(seq);

CREATE TABLE secret_versions (
  id             UUID PRIMARY KEY,
  secret_name    TEXT NOT NULL,
  version        SMALLINT NOT NULL,
  key_material   BYTEA NOT NULL,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ
                 GENERATED ALWAYS AS (last_used_at + INTERVAL '1 year' + INTERVAL '30 days') STORED,
  purged_at      TIMESTAMPTZ,
  UNIQUE(secret_name, version)
);
```

### ハッシュチェーン算出

```text
entry_hash = HMAC-SHA-256(
  key     = AUDIT_HASH_SALT_v{salt_version},
  message = prev_hash || canonicalize_jcs(record_canonical)
)
```

`||` はBYTEA直接結合(SQLの `||` 演算子)。

### `record_canonical` キー集合(13キー)

```json
{
  "id": "...",
  "seq": 123,
  "actor_kind": "user",
  "user_id": "...",
  "guest_session_id": null,
  "target_kind": "document",
  "target_id": "...",
  "action": "document_create",
  "created_at": "2026-06-28T10:00:00.000Z",
  "ip_address_hash": "...",
  "user_agent": "...",
  "payload": { ... },
  "salt_version": 3
}
```

NULLフィールドも省略せず `null` として含める。RFC 8785 JCSで正規化、Unicode正規化はNFCを適用する。`payload` 内部もRFC 8785で再帰的に正規化される。

### 起点(genesis)

```text
最初のレコードの prev_hash = x'00...00'::bytea (256bit全ゼロ)
```

### advisory lockによるseq採番

```sql
BEGIN;
SELECT pg_advisory_xact_lock(0x4155444954);  -- 'AUDIT' = 0x41 0x55 0x44 0x49 0x54
SELECT COALESCE(MAX(seq), 0) + 1 INTO $new_seq FROM audit_logs;
-- prev_hash取得
SELECT entry_hash INTO $prev_hash FROM audit_logs ORDER BY seq DESC LIMIT 1;
-- entry_hash算出してINSERT
INSERT INTO audit_logs (id, seq, ..., prev_hash, entry_hash, salt_version)
VALUES (gen_random_uuid(), $new_seq, ..., $prev_hash, $entry_hash, $current_salt_version);
COMMIT;
```

固定キー `0x4155444954` で全プロセス間のseq単調性を保証する。

### salt_version運用

| 項目                   | 値                                                                             |
| ---------------------- | ------------------------------------------------------------------------------ |
| 保持期間               | `secret_versions.last_used_at + 1年+ 30日グレース`(GENERATED列)                |
| 能動ローテーション周期 | 四半期1回                                                                      |
| 並行保持               | 過去4世代以上                                                                  |
| `last_used_at` 更新    | 当該salt_versionで監査ログがINSERTされる度に同一トランザクション内で更新       |
| 破棄                   | 「該当salt_versionのレコードが全て物理削除済み」を確認した日次バッチでのみ実行 |

旧salt_versionで作成されたレコードは保持期間中、いつでも旧ソルトで検証可能である。発行日基準ではなく最終使用日基準を採用する理由は、旧salt_versionで追記が続いた場合に検証ギャップが発生するためである。

### 検証バッチ

| 項目               | 値                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------- |
| 周期               | 日次0時                                                                                       |
| 所要時間目安       | 1万件/秒                                                                                      |
| 走査順序           | `seq` 昇順                                                                                    |
| 改ざん検出時の挙動 | 別テーブル `audit_logs_quarantine` へ隔離 → バックアップから復元 → salt_versionローテーション |
| 検証権限           | `operations_admin` または `security_admin` のみ                                               |

### `verify_audit_chain` 擬似コード

```text
prev = ZERO_256
for row in audit_logs ORDER BY seq:
  salt = secret_versions.lookup(AUDIT_HASH_SALT, row.salt_version)
  canonical = jcs_normalize(record_canonical(row))
  expected = hmac_sha256(salt, prev || canonical)
  if expected != row.entry_hash:
    quarantine(row); alert(seq=row.seq); break
  prev = row.entry_hash
```

### エラーコード

| コード    | HTTP | 意味                                                         |
| --------- | ---- | ------------------------------------------------------------ |
| `AUD-001` | 500  | チェーン不整合検出(検証バッチ)                               |
| `AUD-002` | 500  | salt_version未登録(レコードのversionがsecret_versionsに無い) |
| `AUD-003` | 503  | advisory lock取得失敗(タイムアウト)                          |

詳細は[19エラーコード登録簿](./19-error-code-registry.md)参照。

## テストID紐付け

| 契約ID          | 内容                                         | テストID  | テスト種別 | CIゲート |
| --------------- | -------------------------------------------- | --------- | ---------- | -------- |
| AUD-CONTRACT-01 | `record_canonical` 13キー集合の正規化決定性  | T-AUD-001 | unit       | Vitest   |
| AUD-CONTRACT-02 | genesisのprev_hash=ZERO_256                  | T-AUD-002 | integ      | Vitest   |
| AUD-CONTRACT-03 | advisory lock下でのseq単調採番               | T-AUD-003 | integ      | Vitest   |
| AUD-CONTRACT-04 | salt_versionローテーション後の旧版検証可能性 | T-AUD-004 | integ      | Vitest   |
| AUD-CONTRACT-05 | チェーン改ざんの検出                         | T-AUD-005 | integ      | Vitest   |
| AUD-CONTRACT-06 | `last_used_at` の追記時更新                  | T-AUD-006 | integ      | Vitest   |

## トレーサビリティ

| 対応要件                                        | 対応基本設計節 | 対応ADR  |
| ----------------------------------------------- | -------------- | -------- |
| NFR-05(監査ログ全般、1年保持、ハッシュチェーン) | §10.1          | ADR-0018 |
