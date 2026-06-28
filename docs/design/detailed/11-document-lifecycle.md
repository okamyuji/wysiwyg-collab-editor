# 11文書ライフサイクルと物理削除

## スコープ

documents DDL、文書管理API、`document_purge` バッチ、`image_purge_queue` への切り出し、audit_logs保持の境界を集約する。

## 契約

### DDL(所有テーブル)

```sql
CREATE TABLE documents (
  id                      UUID PRIMARY KEY,
  owner_id                UUID NOT NULL REFERENCES users(id),
  title                   TEXT NOT NULL,
  sharedb_collection      TEXT NOT NULL,
  sharedb_doc_id          TEXT NOT NULL,
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata_updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_snapshot_version BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_documents_owner ON documents(owner_id, updated_at DESC);
CREATE INDEX idx_documents_deleted ON documents(deleted_at);
```

`cache_etag` は列として保持しない。算出式は[10オフライン閲覧](./10-offline-readonly.md)を参照。

### 文書管理API

| 操作         | エンドポイント                       | 認可                | UPDATE/INSERT                                                                                                   | 監査ログaction                                    |
| ------------ | ------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 新規作成     | `POST /api/documents`                | 認証済み            | `INSERT INTO documents ... INSERT INTO document_permissions(...,owner)`                                         | `document_create`                                 |
| タイトル変更 | `PATCH /api/documents/:id`           | owner               | `UPDATE documents SET title=$t, metadata_updated_at=now()`                                                      | `document_title_change`                           |
| 論理削除     | `DELETE /api/documents/:id`          | owner               | `UPDATE documents SET deleted_at=now(), metadata_updated_at=now()` + WS `force_reload`                          | `document_delete`                                 |
| 復元         | `POST /api/documents/:id/restore`    | ownerまたはcs_admin | `UPDATE documents SET deleted_at=NULL, metadata_updated_at=now() WHERE deleted_at > now() - INTERVAL '30 days'` | `document_restore`または `document_restore_by_cs` |
| 所有者変更   | `PATCH /api/documents/:id/owner`     | owner               | `document_permissions` の所有者更新+旧所有者editor降格                                                          | `document_owner_change`                           |
| 一覧         | `GET /api/documents?cursor=<opaque>` | 認証済み            | `document_permissions` JOIN、ページサイズ50件、cursor pagination                                                | (なし)                                            |

### `document_purge` バッチ

実行頻度: 日次02時、advisory lockで重複起動防止。対象条件と削除順序を厳守する。

```sql
-- 対象条件
SELECT id FROM documents
 WHERE deleted_at IS NOT NULL
   AND deleted_at < now() - INTERVAL '30 days';
```

各対象について1トランザクション内で以下を実行する。

第1段階(削除対象、明示)

```sql
DELETE FROM comments WHERE document_id=$id;
DELETE FROM comment_replies WHERE comment_id IN (SELECT id FROM comments WHERE document_id=$id);
DELETE FROM suggestions WHERE document_id=$id;
DELETE FROM revisions WHERE document_id=$id; -- snapshot_payloadを含む
DELETE FROM archived_ops WHERE document_id=$id;
DELETE FROM document_permissions WHERE document_id=$id;
DELETE FROM share_links WHERE document_id=$id;
DELETE FROM export_jobs WHERE document_id=$id;
DELETE FROM ack_seq_snapshots WHERE document_id=$id;

-- imagesは行削除+オブジェクト本体は image_purge_queue へ
INSERT INTO image_purge_queue (id, storage_key, document_id, original_image_id)
SELECT gen_random_uuid(), storage_key, NULL, id FROM images WHERE document_id=$id;
DELETE FROM images WHERE document_id=$id;
```

第2段階(`documents` 行削除)

```sql
DELETE FROM documents WHERE id=$id;
```

第3段階(監査ログ追記)

```sql
INSERT INTO audit_logs (id, seq, actor_kind, target_kind, target_id, action, payload, ...)
VALUES (gen_random_uuid(), nextval_seq(), 'system', 'document', $id, 'document_purge',
        jsonb_build_object('document_id', $id,
                           'deleted_counts', $counts), ...);
```

保持対象(明示、削除しない)

| テーブル     | 理由                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_logs` | NFR-05第2項の1年保持を優先。`target_kind='document' AND target_id=$id` で参照可能なまま残し、保持期間満了後に通常日次バッチで削除される |

失敗時の挙動: 冪等性により次回再試行(削除対象が無くなれば何もしない)。

### `image_purge_queue` への切り出し

`image_object_purge` バッチ(日次03時)が以下のとおりオブジェクトストレージを掃除する。

```sql
SELECT id, storage_key, attempt_count, original_image_id
  FROM image_purge_queue
 WHERE purge_after <= now()
   AND purged_at IS NULL
   AND attempt_count < 5
 ORDER BY purge_after
 LIMIT 100
 FOR UPDATE SKIP LOCKED;
```

各行についてS3互換APIで `storage_key` を `DeleteObject`、成功時 `purged_at=now()`、失敗時 `attempt_count+1` と `last_error` 記録、`purge_after = now() + LEAST(INTERVAL '60 seconds' * (2 ^ attempt_count), INTERVAL '24 hours')` で指数バックオフ。`attempt_count >= 5` で運用管理者へPrometheusアラート発火する。`image_purge_queue` の所有章は[08画像アップロードと自動削除キュー](./08-image-and-purge.md)とする(本章はINSERT契約のみ持つ)。

### エラーコード

| コード    | HTTP | 意味                           |
| --------- | ---- | ------------------------------ |
| `DOC-001` | 403  | owner以外のタイトル変更        |
| `DOC-002` | 410  | 削除済みかつ30日経過(復元不能) |
| `DOC-003` | 409  | 既に削除済みの再削除           |
| `DOC-004` | 400  | 一覧cursor形式不正             |

詳細は[19エラーコード登録簿](./19-error-code-registry.md)参照。

## テストID紐付け

| 契約ID          | 内容                                                | テストID  | テスト種別 | CIゲート   |
| --------------- | --------------------------------------------------- | --------- | ---------- | ---------- |
| DOC-CONTRACT-01 | 論理削除→WS force_reload送出                        | T-DOC-001 | integ      | Vitest     |
| DOC-CONTRACT-02 | 30日経過後の復元410 DOC-002                         | T-DOC-002 | integ      | Vitest     |
| DOC-CONTRACT-03 | document_purgeで関連エンティティ削除+audit_logs残存 | T-DOC-003 | integ      | Vitest     |
| DOC-CONTRACT-04 | document_purgeでimage_purge_queueへINSERT           | T-DOC-004 | integ      | Vitest     |
| DOC-CONTRACT-05 | cursor pagination 50件単位                          | T-DOC-005 | integ      | Vitest     |
| DOC-CONTRACT-06 | 削除〜30日〜復元〜物理削除のE2E                     | T-DOC-006 | e2e        | Playwright |

## トレーサビリティ

| 対応要件                           | 対応基本設計節 | 対応ADR                 |
| ---------------------------------- | -------------- | ----------------------- |
| FR-12(文書管理)、FR-13(CS代理復元) | §5.12          | (該当ADRなし、要件由来) |
