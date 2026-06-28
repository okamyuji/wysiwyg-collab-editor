# 06版作成とops圧縮

## スコープ

revisions、archived_opsのDDL、自動版/明示版、ops圧縮、`snapshot_payload` 充填、advisory lock、purge保険チェックを集約する。

## 契約

### DDL(所有テーブル)

```sql
CREATE TABLE revisions (
  id               UUID PRIMARY KEY,
  document_id      UUID NOT NULL REFERENCES documents(id),
  version_number   BIGINT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('auto','explicit')),
  created_by       UUID NOT NULL REFERENCES users(id),
  label            TEXT,
  snapshot_payload JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT explicit_needs_payload
    CHECK ((kind = 'explicit' AND snapshot_payload IS NOT NULL) OR kind = 'auto')
);
CREATE INDEX idx_revisions_doc ON revisions(document_id, version_number DESC);
CREATE INDEX idx_revisions_kind ON revisions(document_id, kind, created_at DESC);

CREATE TABLE archived_ops (
  id                  UUID PRIMARY KEY,
  document_id         UUID NOT NULL REFERENCES documents(id),
  v_start             BIGINT NOT NULL,
  v_end               BIGINT NOT NULL CHECK (v_end >= v_start),
  ops                 JSONB NOT NULL,
  archived_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_purge_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '72 hours')
);
CREATE INDEX idx_archived_doc ON archived_ops(document_id, v_end DESC);
CREATE INDEX idx_archived_purge ON archived_ops(scheduled_purge_at);
```

### 版作成パラメータ

| 項目           | 値                                    |
| -------------- | ------------------------------------- |
| 自動版作成条件 | 最後の版から1時間以上 かつ100操作以上 |
| 自動版上限     | 文書1件あたり1000件                   |
| 明示版         | 無期限保持、圧縮対象外                |

### 圧縮の前提条件

- 圧縮区間の境界は必ず既存スナップショット(版)の版番号で切る。
- 明示版が区間内にある場合、明示版直前で区間を区切る。

### advisory lock

```sql
SELECT pg_advisory_xact_lock(
  (hashtextextended($document_id::text, 0) >> 32)::int,
  (hashtextextended($document_id::text, 0) & x'FFFFFFFF'::bigint)::int
);
```

`pg_advisory_xact_lock(int, int)` の2引数版でbigintを32bit分割して渡す。同一文書への圧縮ジョブが並行起動した場合、後発はロック待機後に先発のコミット結果を見て処理範囲を再判定する。

### 圧縮トランザクション内手順

1. 終端版番号 `v_end` で `snapshot_end` をShareDB.snapshotsから取得。
2. 削除候補の自動版をマーキング(明示版と `v_end` 版に対応するスナップショットは保持)。
3. opsを `archived_ops` へ退避(`(document_id, v_start, v_end)` で識別)。
4. `revisions.snapshot_payload` を `snapshot_end` の正規化JSON(json-canonicalize適用)で充填。
5. 削除候補の自動版レコードをDELETE。

整合性検証: 圧縮前後で当該文書最新版スナップショットのSHA-256ハッシュが一致することを必ず検証する。素の `JSON.stringify` は使用不可(キー順序が処理系依存)、json-canonicalizeでRFC 8785正規化する。

### purge保険チェック(72時間後)

```sql
SELECT id FROM archived_ops
 WHERE scheduled_purge_at <= now();
-- 各archive行について
SELECT count(*) FROM revisions
 WHERE document_id = $doc AND version_number = $v_end
   AND snapshot_payload IS NULL;
-- 0なら物理削除、>0ならpurge中止+アラート
```

`revision_reachability_violation_total` カウンタをインクリメントし `RevisionReachabilityViolation` アラート発火、actor_kind=system、action=`reachability_violation` で監査ログ追記する。`snapshot_payload` の事後再計算は不可能(基準スナップショット消失後)のため、purgeバッチは検出と通報のみ。

### 復元手順

1. 対象版時点のスナップショットが残存していることを `revisions.snapshot_payload IS NOT NULL` または `archived_ops` 内で確認。
2. 差分Deltaを計算し新規 `submitOp` としてShareDBへ送出。これにより過去状態が新たな操作として記録され、元の履歴は失われない。
3. 並走編集との衝突は `submitOp` が自動でOT変換吸収。失敗時は最大3回リトライ。

### エラーコード

| コード    | HTTP | 意味                             |
| --------- | ---- | -------------------------------- |
| `VER-001` | 410  | 圧縮済み区間の中間状態(再現不能) |
| `VER-002` | 503  | 圧縮中(advisory lock取得待機)    |
| `VER-003` | 500  | 不変条件違反検出(復元中止)       |
| `VER-004` | 409  | 復元のsubmitOpリトライ上限到達   |

## テストID紐付け

| 契約ID          | 内容                                        | テストID  | テスト種別 | CIゲート   |
| --------------- | ------------------------------------------- | --------- | ---------- | ---------- |
| VER-CONTRACT-01 | 自動版1001件目で最古区間が圧縮される        | T-VER-001 | integ      | Vitest     |
| VER-CONTRACT-02 | 圧縮前後のスナップショットハッシュ一致検証  | T-VER-002 | integ      | Vitest     |
| VER-CONTRACT-03 | `snapshot_payload` NULLでpurge中止+アラート | T-VER-003 | integ      | Vitest     |
| VER-CONTRACT-04 | advisory lockで並行圧縮の直列化             | T-VER-004 | integ      | Vitest     |
| VER-CONTRACT-05 | 復元E2E                                     | T-VER-005 | e2e        | Playwright |

## トレーサビリティ

| 対応要件      | 対応基本設計節                  | 対応ADR            |
| ------------- | ------------------------------- | ------------------ |
| FR-06(版履歴) | §5.7、§5.7.1、§3.4b保険チェック | ADR-0002、ADR-0016 |
