# 09共有リンクとゲストセッション

## スコープ

share_links、guest_sessions DDL、トークン生成、ゲストCookie、短命WebSocketトークンの発行、失効処理を集約する。WSサブプロトコルのバイト形式は[03認証セッションCSRF](./03-auth-session-csrf.md)を参照する。

## 契約

### DDL(所有テーブル)

```sql
CREATE TABLE share_links (
  id               UUID PRIMARY KEY,
  document_id      UUID NOT NULL REFERENCES documents(id),
  token            TEXT NOT NULL UNIQUE,
  link_kind        TEXT NOT NULL CHECK (link_kind IN ('restricted','anyone')),
  permission_level TEXT NOT NULL CHECK (permission_level IN ('viewer','commenter')),
  expires_at       TIMESTAMPTZ NOT NULL,
  created_by       UUID NOT NULL REFERENCES users(id),
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expires_within_30_days
    CHECK (expires_at <= created_at + INTERVAL '30 days')
);
CREATE INDEX idx_share_links_active
  ON share_links(document_id, revoked_at);

CREATE TABLE guest_sessions (
  id              UUID PRIMARY KEY,
  share_link_id   UUID NOT NULL REFERENCES share_links(id),
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent      TEXT,
  ip_address_hash BYTEA NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_guest_sessions_link
  ON guest_sessions(share_link_id, last_seen_at DESC);
```

### トークン生成

```text
crypto.randomBytes(32).toString('base64url') -> 43文字のtoken
```

### ゲストCookie

| 属性     | 値                                     |
| -------- | -------------------------------------- |
| 名前     | `guest_session`                        |
| Path     | `/share/<token>`(共有リンクページ専用) |
| HttpOnly | true                                   |
| Secure   | true                                   |
| SameSite | Lax                                    |
| Max-Age  | 共有リンク `expires_at` に同期         |

Cookieは `/sharedb` へは届かない。

### 短命WebSocketトークン

| 項目           | 値                                                           |
| -------------- | ------------------------------------------------------------ |
| 署名           | HMAC-SHA-256(key=GUEST_WS_TOKEN_SECRET)                      |
| ペイロード     | `{ guest_session_id, share_link_id, permission_level, exp }` |
| 有効期限       | 15分                                                         |
| 発行タイミング | 共有リンクページHTMLレスポンスと同時発行                     |
| 受け渡し       | `<meta name="ws-guest-token" content="<token>">`             |
| WS送信         | `Sec-WebSocket-Protocol: guest-token.<token>`(03章の規約)    |

### IPアドレスハッシュ

```text
ip_address_hash = HMAC-SHA-256(key=IP_HASH_SECRET, message=client_ip)
```

`IP_HASH_SECRET` は秘密管理基盤(secret_versions)で年1回ローテーション、鍵世代を `guest_sessions` には保持しない(MVP範囲)。

### 共有リンクアクセス分岐

| リンク種別   | 認証要否                           | セッション発行                      |
| ------------ | ---------------------------------- | ----------------------------------- |
| `restricted` | 必須(未認証はログインリダイレクト) | 通常セッション、認可は通常フロー    |
| `anyone`     | 不要                               | guest_session新規またはCookie再利用 |

### 失効処理

| 項目           | 内容                                                                          |
| -------------- | ----------------------------------------------------------------------------- |
| 失効API        | `DELETE /api/documents/:id/share-links/:linkId`                               |
| 失効SQL        | `UPDATE share_links SET revoked_at=now() WHERE id=$id AND revoked_at IS NULL` |
| 失効後アクセス | HTTP 410 Gone(`SHR-001`)                                                      |
| 失効後WS       | 当該リンク発行ゲストへCloseコード4410を送信                                   |
| 監査ログ       | action=`share_link_revoke`(通常)または `share_link_revoke_by_cs`(CS代理)      |

### エラーコード

| コード    | HTTP/Close | 意味                                      |
| --------- | ---------- | ----------------------------------------- |
| `SHR-001` | 410        | リンク失効または期限切れ                  |
| `SHR-002` | 400        | `permission_level` がviewer/commenter以外 |
| `SHR-003` | 400        | `expires_at` が30日を超過                 |
| `SHR-004` | 401        | WSサブプロトコルトークン無効              |
| `SHR-005` | 4410       | WebSocket強制クローズ(リンク失効)         |

詳細は[19エラーコード登録簿](./19-error-code-registry.md)参照。

## テストID紐付け

| 契約ID          | 内容                                          | テストID  | テスト種別 | CIゲート   |
| --------------- | --------------------------------------------- | --------- | ---------- | ---------- |
| SHR-CONTRACT-01 | 30日超過リンク発行で400 SHR-003               | T-SHR-001 | integ      | Vitest     |
| SHR-CONTRACT-02 | editor指定で400 SHR-002                       | T-SHR-002 | integ      | Vitest     |
| SHR-CONTRACT-03 | ゲストCookie Path制約で `/sharedb` に届かない | T-SHR-003 | integ      | Vitest     |
| SHR-CONTRACT-04 | サブプロトコルトークン15分失効                | T-SHR-004 | integ      | Vitest     |
| SHR-CONTRACT-05 | 失効後アクセス410 SHR-001                     | T-SHR-005 | e2e        | Playwright |
| SHR-CONTRACT-06 | 失効でゲストWS Close 4410                     | T-SHR-006 | integ      | Vitest     |

## トレーサビリティ

| 対応要件                                      | 対応基本設計節           | 対応ADR  |
| --------------------------------------------- | ------------------------ | -------- |
| FR-04(共有リンク)、NFR-04第13項(ゲストWS認可) | §5.9、ADR-0006のゲスト節 | ADR-0006 |
