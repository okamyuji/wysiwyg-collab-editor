# 05提案モード二段CAS

## スコープ

提案エンティティのDDL、受諾の二段CAS手順、stale/expired遷移CAS、却下、自動stale化バッチを集約する。

## 契約

### suggestions DDL(所有テーブル)

```sql
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
CREATE INDEX idx_suggestions_hot
  ON suggestions(document_id, status, created_at DESC);
CREATE INDEX idx_suggestions_rebase
  ON suggestions(document_id, status, base_version);
```

`accepting` は受諾の第一CASで占有された一時状態である。

### 受諾の二段CAS手順

第一CAS(claim)からsubmitOpを経て第二CAS(confirm)で確定する三ステップを単一HTTPリクエスト内で実行する。

```sql
-- 手順1 リベース
-- base_versionから現在版までの本文opsを取得しQuill.jsのDelta.transformで提案Deltaをリベース
-- リベース不能(アンカー削除済または結果が空)は stale 遷移CAS(後述)へ進みHTTP 409応答

-- 手順2 第一CAS(claim)
UPDATE suggestions
   SET status='accepting',
       status_changed_at=now(),
       status_changed_by=$user,
       optimistic_version=optimistic_version+1
 WHERE id=$id
   AND optimistic_version=$expected_v
   AND status='pending';
-- 0行更新→他者が先に状態変更したためHTTP 409 SUG-001応答、submitOp実行せず

-- 手順3 submitOp実行(第一CAS成功時のみ)
-- リベース済DeltaをShareDB.submitOpで適用、結果版番号を $applied に保持
-- submitOp失敗(例外/タイムアウト)→補償CAS実行しHTTP 503 SUG-002応答

-- 手順4 補償CAS(submitOp失敗時のみ)
UPDATE suggestions
   SET status='pending',
       optimistic_version=optimistic_version+1
 WHERE id=$id
   AND status='accepting';

-- 手順5 第二CAS(confirm、submitOp成功時のみ)
UPDATE suggestions
   SET status='accepted',
       applied_version=$applied,
       status_changed_at=now(),
       optimistic_version=optimistic_version+1
 WHERE id=$id
   AND status='accepting';
-- 第一CASで accepting を占有しているため必ず成功
```

### stale遷移CAS(リベース失敗時)

```sql
UPDATE suggestions
   SET status='stale',
       status_changed_at=now(),
       status_changed_by=$user,
       optimistic_version=optimistic_version+1
 WHERE id=$id
   AND optimistic_version=$v
   AND status='pending';
-- 0行更新→他者が先に rejected/accepting に遷移済 SUG-003 HTTP 409応答
```

### expired遷移CAS(自動失効バッチ)

```sql
UPDATE suggestions
   SET status='expired',
       status_changed_at=now(),
       status_changed_by=NULL,
       optimistic_version=optimistic_version+1
 WHERE id=$id
   AND optimistic_version=$v
   AND status='pending';
-- 0行更新→ accepting に遷移済のため当該バッチサイクルでは触らず次サイクルで再判定
```

### 却下

```sql
UPDATE suggestions
   SET status='rejected',
       status_changed_at=now(),
       status_changed_by=$user,
       optimistic_version=optimistic_version+1
 WHERE id=$id
   AND optimistic_version=$v
   AND status='pending';
```

### バッチパラメータ

| 項目                         | 値                                                   |
| ---------------------------- | ---------------------------------------------------- |
| 自動stale化バッチ周期        | 10分                                                 |
| 1サイクル1文書あたり処理上限 | 100件                                                |
| 提案粒度(クライアント側)     | 連続入力を5秒の無操作で1提案に確定                   |
| Delta上限                    | 1提案あたり64KB(CHECK制約で強制、超過受信はHTTP 413) |

### エラーコード

| コード    | HTTP | 意味                                  |
| --------- | ---- | ------------------------------------- |
| `SUG-001` | 409  | 受諾の第一CAS競合(他者先行)           |
| `SUG-002` | 503  | submitOp失敗、補償CAS完了、リトライ可 |
| `SUG-003` | 409  | リベース不能でstale遷移               |
| `SUG-004` | 413  | Delta上限64KB超過                     |
| `SUG-005` | 410  | 提案が既にexpired                     |

詳細は[19エラーコード登録簿](./19-error-code-registry.md)参照。

## テストID紐付け

| 契約ID          | 内容                                         | テストID  | テスト種別 | CIゲート   |
| --------------- | -------------------------------------------- | --------- | ---------- | ---------- |
| SUG-CONTRACT-01 | 第一CAS成功でsubmitOp実行                    | T-SUG-001 | integ      | Vitest     |
| SUG-CONTRACT-02 | 第一CAS競合でHTTP 409 SUG-001                | T-SUG-002 | integ      | Vitest     |
| SUG-CONTRACT-03 | submitOp失敗で補償CAS+pending復帰            | T-SUG-003 | integ      | Vitest     |
| SUG-CONTRACT-04 | 第二CAS確定でacceptedかつapplied_version設定 | T-SUG-004 | integ      | Vitest     |
| SUG-CONTRACT-05 | リベース不能でstale遷移                      | T-SUG-005 | integ      | Vitest     |
| SUG-CONTRACT-06 | accepting占有中の自動失効バッチは触らない    | T-SUG-006 | integ      | Vitest     |
| SUG-CONTRACT-07 | Delta 64KB超過で413                          | T-SUG-007 | integ      | Vitest     |
| SUG-CONTRACT-08 | 提案受諾の本文反映E2E                        | T-SUG-008 | e2e        | Playwright |

## トレーサビリティ

| 対応要件                                              | 対応基本設計節           | 対応ADR  |
| ----------------------------------------------------- | ------------------------ | -------- |
| FR-05(提案モード)、要件定義書 第8章 項番10(5秒区切り) | §5.6、§3.2 suggestions行 | ADR-0011 |
