# 15レートリミット

## スコープ

エンドポイント別レート制限、429応答ヘッダ、Redisキー設計、超過時の監査ログ追記を集約する。

## 契約

### レートリミット表

| エンドポイント                          | 窓       | 上限                        | キー                                 |
| --------------------------------------- | -------- | --------------------------- | ------------------------------------ |
| `POST /api/auth/login`                  | 10分     | アカウント単位5回           | `rate:login:user:<user_id>`          |
| `POST /api/auth/login`                  | 15分     | IP単位20回                  | `rate:login:ip:<ip_hash>`            |
| `POST /api/auth/password-reset/request` | 1時間    | IP単位5回                   | `rate:pwreset:ip:<ip_hash>`          |
| `POST /api/csp-report`                  | 1分      | IP単位10件                  | `rate:csp:ip:<ip_hash>`              |
| `POST /api/documents/:id/exports`       | 同時実行 | 利用者2件                   | `rate:export:user:<user_id>`         |
| `POST /api/documents/:id/images`        | 1分      | 利用者20件                  | `rate:image:user:<user_id>`          |
| 全REST API共通                          | 1分      | IP単位600件                 | `rate:api:ip:<ip_hash>`              |
| WebSocket `submit`                      | 1秒      | クライアントセッション100件 | `rate:ws:submit:<client_session_id>` |

### Redisキー設計

```text
key   = "rate:<scope>:<dim>:<value>"
value = counter (incr)
TTL   = 窓秒
```

```redis
INCR rate:login:user:<user_id>
EXPIRE rate:login:user:<user_id> 600 NX  -- 初回設定のみ
```

`NX` で初回設定時のみTTLを与え、上書きを防ぐ。

### 429応答

```text
HTTP/1.1 429 Too Many Requests
Retry-After: <seconds>
X-RateLimit-Limit: <max>
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <unix_seconds>
Content-Type: application/json

{ "data": null, "error": { "code": "RL-NNN", "message": "...", "details": { "retry_after": ... } } }
```

### 監査ログ追記

| エンドポイント         | action                       |
| ---------------------- | ---------------------------- |
| ログイン               | `login_rate_limit`           |
| パスワードリセット要求 | `password_reset_rate_limit`  |
| CSP違反レポート        | (本体は集約モード、追記なし) |
| エクスポート           | `export_rate_limit`          |
| 画像アップロード       | `image_rate_limit`           |
| 全REST API共通         | `api_rate_limit`             |

### エラーコード

| コード   | HTTP | 意味                              |
| -------- | ---- | --------------------------------- |
| `RL-001` | 429  | ログイン試行制限超過              |
| `RL-002` | 429  | パスワードリセット要求超過        |
| `RL-003` | 429  | エクスポート同時実行上限          |
| `RL-004` | 429  | 画像アップロード窓上限            |
| `RL-005` | 429  | REST API窓上限                    |
| `RL-006` | 4429 | WebSocket submit上限(Closeコード) |

## テストID紐付け

| 契約ID         | 内容                      | テストID | テスト種別 | CIゲート |
| -------------- | ------------------------- | -------- | ---------- | -------- |
| RL-CONTRACT-01 | ログイン5失敗で429 RL-001 | T-RL-001 | integ      | Vitest   |
| RL-CONTRACT-02 | `Retry-After` ヘッダ付与  | T-RL-002 | integ      | Vitest   |
| RL-CONTRACT-03 | 窓経過後のリセット        | T-RL-003 | integ      | Vitest   |
| RL-CONTRACT-04 | 監査ログ追記              | T-RL-004 | integ      | Vitest   |

## トレーサビリティ

| 対応要件                         | 対応基本設計節     | 対応ADR  |
| -------------------------------- | ------------------ | -------- |
| NFR-04(セキュリティのレート制限) | (基本設計には散在) | ADR-0027 |
