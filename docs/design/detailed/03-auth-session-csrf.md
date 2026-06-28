# 03認証・セッション・CSRF・WSサブプロトコル

## スコープ

認証済み利用者のセッション、CSRFトークン、Argon2idパラメータ、ログイン試行制限、メール検証、パスワードリセット、ゲスト用WebSocketサブプロトコル形式の契約を集約する。ゲストセッションのライフサイクル本体は[09共有リンクとゲストセッション](./09-share-link-and-guest.md)で扱う。

## 契約

### Argon2idパラメータ

OWASP推奨2026の必達値である。

| 項目         | 値       |
| ------------ | -------- |
| アルゴリズム | Argon2id |
| メモリ       | 19MiB    |
| 反復数       | 2        |
| 並列度       | 1        |
| 出力長       | 32バイト |
| ソルト長     | 16バイト |

### セッションCookie属性

| 属性     | 値                                 |
| -------- | ---------------------------------- |
| 名前     | `connect.sid`(express-session既定) |
| Domain   | アプリケーションドメイン(共有なし) |
| Path     | `/`                                |
| HttpOnly | true                               |
| Secure   | true                               |
| SameSite | Lax                                |
| Max-Age  | 1209600(14日、再アクセス毎に延長)  |
| Store    | Redis(`sess:<sid>` キー、TTL同期)  |

### パスワードポリシー

| 項目       | 値                                                 |
| ---------- | -------------------------------------------------- |
| 最小文字数 | 12                                                 |
| 必須文字種 | 大文字・小文字・数字・記号のうち3種類以上          |
| 辞書照合   | Have I Been Pwned k-anonymity API、120日キャッシュ |

### ログイン試行制限

| 範囲           | 窓   | 上限   | ブロック時間 |
| -------------- | ---- | ------ | ------------ |
| アカウント単位 | 10分 | 5失敗  | 10分         |
| IP単位         | 15分 | 20失敗 | 30分         |

カウンタはRedisのキー `login_fail:user:<user_id>` および `login_fail:ip:<ip_hash>` で管理する。TTLは窓と同値。

### メール検証・パスワードリセット

| 項目         | 値                                                                |
| ------------ | ----------------------------------------------------------------- |
| トークン生成 | `crypto.randomBytes(32).toString('base64url')`                    |
| ハッシュ保管 | SHA-256ハッシュを `password_resets.token_hash` に保管             |
| 有効期限     | 1時間                                                             |
| 再利用防止   | 部分UNIQUE `WHERE used_at IS NULL` で同一user_idの未使用は1件まで |

### CSRFトークン(csrf-csrf)

| 項目       | 値                                                                           |
| ---------- | ---------------------------------------------------------------------------- |
| ライブラリ | csrf-csrf(csurfはアーカイブ済みのため不採用)                                 |
| 方式       | Double Submit Cookie + HMAC                                                  |
| 必須ヘッダ | `X-CSRF-Token`                                                               |
| 適用対象   | 全ての状態変更APIメソッド(POST/PATCH/PUT/DELETE)                             |
| 例外       | `POST /api/csp-report`(ブラウザ自動送信のため。Origin検証とレート制限で代替) |
| WebSocket  | Origin照合のみ                                                               |

### ゲスト用WebSocketサブプロトコル形式

ゲストCookieは `Path=/share/<token>` 制約により `/sharedb` パスへ届かないため、ゲストはWebSocket接続時にサブプロトコルでトークンを送信する。

| 項目           | 値                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------- |
| ヘッダ形式     | `Sec-WebSocket-Protocol: guest-token.<token>`                                                       |
| トークン署名   | HMAC-SHA-256(key=GUEST_WS_TOKEN_SECRET)                                                             |
| ペイロード     | `{ guest_session_id, share_link_id, permission_level, exp }`                                        |
| 有効期限       | 15分                                                                                                |
| 発行タイミング | 共有リンクページのHTMLレスポンスに同時発行、`<meta name="ws-guest-token" content="...">` で埋め込み |
| サーバー検証   | `verifyClient` フックでCookie(認証済み)または本サブプロトコル(ゲスト)のいずれか有効を判定           |
| 無効時挙動     | HTTPアップグレード前にHTTP 401で拒否、監査ログ追記                                                  |

詳細は[09共有リンクとゲストセッション](./09-share-link-and-guest.md)を参照する。

### ログインフローのエラー応答

| 失敗種別                 | HTTP | エラーコード |
| ------------------------ | ---- | ------------ |
| メールアドレス未登録     | 401  | `AUTH-001`   |
| パスワード不一致         | 401  | `AUTH-002`   |
| アカウントブロック中     | 423  | `AUTH-003`   |
| IPブロック中             | 429  | `AUTH-004`   |
| メール未検証             | 403  | `AUTH-005`   |
| Argon2id検証エラー(改竄) | 500  | `AUTH-006`   |

エラーコード本文は[19エラーコード登録簿](./19-error-code-registry.md)を参照する。

## テストID紐付け

| 契約ID           | 内容                                   | テストID   | テスト種別 | CIゲート   |
| ---------------- | -------------------------------------- | ---------- | ---------- | ---------- |
| AUTH-CONTRACT-01 | Argon2idパラメータが規定値で生成される | T-AUTH-001 | unit       | Vitest     |
| AUTH-CONTRACT-02 | Cookie属性HttpOnly/Secure/SameSite=Lax | T-AUTH-002 | integ      | Vitest     |
| AUTH-CONTRACT-03 | アカウントロック(5失敗で10分)          | T-AUTH-003 | integ      | Vitest     |
| AUTH-CONTRACT-04 | IPブロック(20失敗で30分)               | T-AUTH-004 | integ      | Vitest     |
| AUTH-CONTRACT-05 | パスワードリセットトークン1時間失効    | T-AUTH-005 | integ      | Vitest     |
| AUTH-CONTRACT-06 | CSRFトークン未送信は400拒否            | T-AUTH-006 | e2e        | Playwright |
| AUTH-CONTRACT-07 | ゲストWSサブプロトコル15分失効         | T-AUTH-007 | integ      | Vitest     |
| AUTH-CONTRACT-08 | 認証なしWebSocketアップグレード401     | T-AUTH-008 | e2e        | Playwright |

## トレーサビリティ

| 対応要件                                                       | 対応基本設計節   | 対応ADR                      |
| -------------------------------------------------------------- | ---------------- | ---------------------------- |
| FR-08(認証)、FR-09第4項(オフラインキューなし)、NFR-04第1〜13項 | §5.1、§6.1、§6.2 | ADR-0006、ADR-0010、ADR-0027 |
