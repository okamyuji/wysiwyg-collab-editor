# 02 API共通契約

## スコープ

REST/WebSocket全体に共通する応答エンベロープ、カーソルページング、認可ヘッダ、CSP違反レポート例外を集約する。エンドポイント別の入出力スキーマは各ドメイン章に置く。

## 契約

### 共通応答エンベロープ

```json
{
  "data": { ... } | null,
  "error": { "code": "DOM-NNN", "message": "...", "details": { ... } } | null,
  "meta": { "request_id": "uuid", "trace_id": "uuid" }
}
```

- 成功: `data` NOT NULL、`error` NULL
- 失敗: `data` NULL、`error` NOT NULL

`code` は章接頭辞付き(例: `SUG-001`、`EXP-002`、`AUTH-003`)で[19エラーコード登録簿](./19-error-code-registry.md)に登録する。

### カーソルページング

ページ番号方式は本MVPで採用しない(連続ページネーション中の挿入/削除で重複や欠落が発生するため)。

```text
GET /api/.../list?cursor=<opaque>&limit=50
Response: { data: [...], meta: { next_cursor: "..." | null } }
```

`limit` の上限は50件。`cursor` は不透明文字列(サーバー側でbase64url符号化したJWT相当)。

### 認可ヘッダ

| ヘッダ                                        | 用途                                     |
| --------------------------------------------- | ---------------------------------------- |
| `Cookie: connect.sid=...`                     | 認証済み利用者(自動送信)                 |
| `Cookie: guest_session=...`                   | ゲスト利用者(Path=/share/<token>限定)    |
| `X-CSRF-Token: ...`                           | 状態変更APIで必須(POST/PATCH/PUT/DELETE) |
| `Sec-WebSocket-Protocol: guest-token.<token>` | ゲスト用WebSocket接続                    |

### CSP違反レポート例外

`POST /api/csp-report` のみ `X-CSRF-Token` を要求しない。代替検証は[13 CSPとサニタイズ](./13-csp-and-sanitization.md)を参照。

### Content-Type

| エンドポイント種別           | Content-Type                                                         |
| ---------------------------- | -------------------------------------------------------------------- |
| 通常API                      | `application/json`                                                   |
| 画像アップロード             | `multipart/form-data`                                                |
| CSP違反レポート              | `application/csp-report` または `application/reports+json`           |
| エクスポート結果ダウンロード | 形式別(`application/pdf`、`...wordprocessingml...`、`text/markdown`) |

### レート制限ヘッダ(429時)

```text
HTTP/1.1 429 Too Many Requests
Retry-After: <seconds>
X-RateLimit-Limit: <max>
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <unix_seconds>
```

詳細は[15レートリミット](./15-rate-limit.md)を参照。

## テストID紐付け

| 契約ID          | 内容                                     | テストID  | テスト種別 | CIゲート   |
| --------------- | ---------------------------------------- | --------- | ---------- | ---------- |
| API-CONTRACT-01 | 全エンドポイントが共通エンベロープを返す | T-API-001 | integ      | Vitest     |
| API-CONTRACT-02 | カーソルページング50件単位               | T-API-002 | integ      | Vitest     |
| API-CONTRACT-03 | CSRF不正で400拒否                        | T-API-003 | e2e        | Playwright |

## トレーサビリティ

| 対応要件                                                 | 対応基本設計節   | 対応ADR  |
| -------------------------------------------------------- | ---------------- | -------- |
| NFR-04(セキュリティ)、NFR-06(可用性)、NFR-09(キャッシュ) | §4.1、§4.2、§4.3 | ADR-0010 |
