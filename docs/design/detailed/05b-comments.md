# 05bコメント追加

## スコープ

`comments` と `comment_replies` のDDL、アンカー追従、ゲストコメント可否、解決状態切替を集約する。

## 契約

### DDL(所有テーブル)

```sql
CREATE TABLE comments (
  id                       UUID PRIMARY KEY,
  document_id              UUID NOT NULL REFERENCES documents(id),
  anchor_start             BIGINT NOT NULL,
  anchor_end               BIGINT NOT NULL CHECK (anchor_end >= anchor_start),
  body                     TEXT NOT NULL,
  author_id                UUID REFERENCES users(id),
  author_guest_session_id  UUID REFERENCES guest_sessions(id),
  resolved_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT author_xor
    CHECK ((author_id IS NOT NULL AND author_guest_session_id IS NULL) OR
           (author_id IS NULL AND author_guest_session_id IS NOT NULL))
);
CREATE INDEX idx_comments_doc ON comments(document_id, resolved_at);
CREATE INDEX idx_comments_anchor ON comments(document_id, anchor_start);

CREATE TABLE comment_replies (
  id                       UUID PRIMARY KEY,
  comment_id               UUID NOT NULL REFERENCES comments(id),
  body                     TEXT NOT NULL,
  author_id                UUID REFERENCES users(id),
  author_guest_session_id  UUID REFERENCES guest_sessions(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT author_xor_reply
    CHECK ((author_id IS NOT NULL AND author_guest_session_id IS NULL) OR
           (author_id IS NULL AND author_guest_session_id IS NOT NULL))
);
CREATE INDEX idx_comment_replies ON comment_replies(comment_id, created_at);
```

### アンカー追従

本文編集発生時のクライアント側アンカー追従はQuill.jsのDelta `transform` 規則に従う。サーバー側アンカーは定期的にクライアントから送信される現在位置でUPSERTする(間隔30秒、明示変更時は即時)。

### 認可

| ロール                         | コメント作成 | 返信 | 解決切替             |
| ------------------------------ | ------------ | ---- | -------------------- |
| `owner`、`editor`、`commenter` | 可           | 可   | 可                   |
| `viewer`                       | 不可         | 不可 | 不可                 |
| ゲスト(共有リンク`commenter`)  | 可           | 可   | 不可(作成者本人のみ) |
| ゲスト(共有リンク`viewer`)     | 不可         | 不可 | 不可                 |

### エラーコード

| コード    | HTTP | 意味                          |
| --------- | ---- | ----------------------------- |
| `CMT-001` | 403  | viewerのコメント試行          |
| `CMT-002` | 400  | アンカー範囲不正(start > end) |
| `CMT-003` | 410  | 削除済み文書へのコメント試行  |

## テストID紐付け

| 契約ID          | 内容                          | テストID  | テスト種別 | CIゲート   |
| --------------- | ----------------------------- | --------- | ---------- | ---------- |
| CMT-CONTRACT-01 | viewerコメント403             | T-CMT-001 | integ      | Vitest     |
| CMT-CONTRACT-02 | 本文編集後のアンカー追従      | T-CMT-002 | integ      | Vitest     |
| CMT-CONTRACT-03 | ゲストコメンターのコメントE2E | T-CMT-003 | e2e        | Playwright |

## トレーサビリティ

| 対応要件        | 対応基本設計節 | 対応ADR  |
| --------------- | -------------- | -------- |
| FR-03(コメント) | §5.5           | ADR-0010 |
