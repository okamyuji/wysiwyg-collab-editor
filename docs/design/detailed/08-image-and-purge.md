# 08画像アップロードと自動削除キュー

## スコープ

images、image_purge_queueのDDL、画像アップロードフロー、Exif除去、3サムネイル生成、自動削除キューの48時間遅延と指数バックオフを集約する。

## 契約

### DDL(所有テーブル)

```sql
CREATE TABLE images (
  id           UUID PRIMARY KEY,
  document_id  UUID NOT NULL REFERENCES documents(id),
  storage_key  TEXT NOT NULL,
  mime_type    TEXT NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp','image/gif')),
  byte_size    BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  width        INT NOT NULL,
  height       INT NOT NULL,
  thumbnails   JSONB NOT NULL,
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_images_doc ON images(document_id);

CREATE TABLE image_purge_queue (
  id                 UUID PRIMARY KEY,
  storage_key        TEXT NOT NULL,
  document_id        UUID REFERENCES documents(id),
  original_image_id  UUID NOT NULL,
  queued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_after        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
  attempt_count      SMALLINT NOT NULL DEFAULT 0,
  last_error         TEXT,
  purged_at          TIMESTAMPTZ,
  UNIQUE(storage_key, original_image_id)
);
CREATE INDEX idx_image_purge_ready
  ON image_purge_queue(purge_after) WHERE purged_at IS NULL;
```

`UNIQUE(storage_key, original_image_id)` で `document_purge` の再投入冪等性を保証する。

### アップロードフロー

| 段階           | 内容                                                        |
| -------------- | ----------------------------------------------------------- |
| 受信           | `multipart/form-data` で `POST /api/documents/:id/images`   |
| MIME検証       | Content-Typeとマジックバイトの二重チェック                  |
| サイズ上限     | 10MiB(`byte_size` CHECK制約)                                |
| Exif除去       | `sharp` で自動除去                                          |
| サムネイル生成 | 3サイズ(長辺1280px, 640px, 320px)、形式は元と同一           |
| 保存先         | MinIO `docs-images` バケット                                |
| メタデータ保存 | `images` 行INSERT、`thumbnails` JSONBに3サイズのstorage_key |
| 応答           | `images.id` と署名URL                                       |

### サムネイルJSONB形式

```json
{
  "size_1280": "docs-images/2026/06/<uuid>/1280.webp",
  "size_640": "docs-images/2026/06/<uuid>/640.webp",
  "size_320": "docs-images/2026/06/<uuid>/320.webp"
}
```

### `image_object_purge` バッチ

実行間隔: 日次03時。

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

各行についてS3互換APIで `DeleteObject(storage_key)` を実行する。

| 結果                 | 挙動                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 成功                 | `UPDATE ... SET purged_at = now()`                                                                                                      |
| 失敗                 | `attempt_count + 1`、`last_error` 記録、`purge_after = now() + LEAST(INTERVAL '60 seconds' * (2 ^ attempt_count), INTERVAL '24 hours')` |
| `attempt_count >= 5` | Prometheusアラート `ImagePurgeFailureRepeated`、運用管理者通知                                                                          |

### `document_purge` からの投入

[11文書ライフサイクル](./11-document-lifecycle.md)の `document_purge` バッチが `images` の行削除と同一トランザクション内で本キューへINSERTする。本キューは48時間後にオブジェクト本体を削除するため、復元グレース期間との整合性が保たれる(`documents.deleted_at + 30日+ 48時間` で物理消滅)。

### エラーコード

| コード    | HTTP | 意味                               |
| --------- | ---- | ---------------------------------- |
| `IMG-001` | 413  | サイズ上限10MiB超過                |
| `IMG-002` | 415  | 非対応MIME                         |
| `IMG-003` | 400  | マジックバイトとContent-Type不一致 |
| `IMG-004` | 503  | `storage_unavailable`              |
| `IMG-005` | 500  | サムネイル生成失敗                 |

## テストID紐付け

| 契約ID          | 内容                          | テストID  | テスト種別 | CIゲート   |
| --------------- | ----------------------------- | --------- | ---------- | ---------- |
| IMG-CONTRACT-01 | 10MiB超過413                  | T-IMG-001 | integ      | Vitest     |
| IMG-CONTRACT-02 | Exif除去確認                  | T-IMG-002 | unit       | Vitest     |
| IMG-CONTRACT-03 | 3サムネイル生成               | T-IMG-003 | integ      | Vitest     |
| IMG-CONTRACT-04 | 48時間後のpurge実行           | T-IMG-004 | integ      | Vitest     |
| IMG-CONTRACT-05 | purge失敗の指数バックオフ     | T-IMG-005 | integ      | Vitest     |
| IMG-CONTRACT-06 | 5回失敗でアラート             | T-IMG-006 | integ      | Vitest     |
| IMG-CONTRACT-07 | アップロード〜エディタ挿入E2E | T-IMG-007 | e2e        | Playwright |

## トレーサビリティ

| 対応要件                                                     | 対応基本設計節                         | 対応ADR            |
| ------------------------------------------------------------ | -------------------------------------- | ------------------ |
| FR-11(画像アップロード)、要件定義書 第8章 項番6(3サムネイル) | §5.8、§3.2 images・image_purge_queue行 | ADR-0007、ADR-0024 |
