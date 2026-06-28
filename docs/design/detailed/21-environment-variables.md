# 21環境変数

## スコープ

全環境変数の定義と用途、初期値、必須性、ローテーション周期、漏えい時の挙動を集約する。`.env.example` の元データとする。

## 環境変数一覧

| キー                          | 用途                                                | 必須     | 初期値の出所                      | ローテーション                       | 漏えい時                                             |
| ----------------------------- | --------------------------------------------------- | -------- | --------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| `NODE_ENV`                    | 実行モード                                          | 必須     | `production`/`development`/`test` | (固定)                               | -                                                    |
| `LOG_LEVEL`                   | pinoのログレベル                                    | 必須     | `info`(prod)、`debug`(dev)        | (固定)                               | -                                                    |
| `APP_BASE_URL`                | 公開URL(`https://example.com`)                      | 必須     | デプロイ環境ごと                  | -                                    | -                                                    |
| `SESSION_COOKIE_DOMAIN`       | セッションCookieのDomain属性                        | 必須     | 公開ドメイン                      | -                                    | -                                                    |
| `SESSION_SECRET`              | express-sessionの署名鍵(32バイト以上のランダム)     | 必須     | 秘密管理基盤                      | 半年                                 | 即時失効+全セッション破棄                            |
| `CSRF_SECRET`                 | csrf-csrfのHMAC鍵(32バイト以上)                     | 必須     | 秘密管理基盤                      | 半年                                 | 即時失効                                             |
| `CACHE_ETAG_SECRET`           | 詳細10 cache_etag算出鍵                             | 必須     | 秘密管理基盤                      | 年1回                                | 即時失効、全クライアントが次回問い合わせで新ETag取得 |
| `IP_HASH_SECRET`              | 詳細09 IPアドレスHMACハッシュ鍵                     | 必須     | 秘密管理基盤                      | 年1回                                | 即時失効                                             |
| `GUEST_WS_TOKEN_SECRET`       | 詳細09短命WSトークンHMAC鍵                          | 必須     | 秘密管理基盤                      | 半年                                 | 即時失効、発行済みトークンは15分以内に自然失効       |
| `AUDIT_HASH_SALT_v{N}`        | 詳細14監査ログハッシュチェーン鍵(世代ごと)          | 必須     | 秘密管理基盤                      | 四半期(`AUD_SALT_ROTATION_QUARTERS`) | 即時失効+検出時隔離                                  |
| `AUDIT_CURRENT_SALT_VERSION`  | 現行salt_version番号                                | 必須     | `1` から開始、ローテーションで+1  | -                                    | -                                                    |
| `DB_HOST`                     | PostgreSQL接続ホスト                                | 必須     | デプロイ環境                      | -                                    | -                                                    |
| `DB_PORT`                     | PostgreSQL接続ポート(`5432`)                        | 必須     | `5432`                            | -                                    | -                                                    |
| `DB_NAME`                     | データベース名                                      | 必須     | `wysiwyg_collab`                  | -                                    | -                                                    |
| `DB_USER`                     | DBユーザー名                                        | 必須     | デプロイ環境                      | -                                    | -                                                    |
| `DB_PASSWORD`                 | DBパスワード                                        | 必須     | 秘密管理基盤                      | 半年                                 | 即時失効                                             |
| `DB_POOL_MAX`                 | 接続プール最大数(`20`)                              | 必須     | `20`                              | -                                    | -                                                    |
| `DB_SSL_MODE`                 | SSL接続モード(`require`/`disable`)                  | 必須     | `require`(prod)                   | -                                    | -                                                    |
| `REDIS_URL`                   | Redis接続URL(`redis://host:6379/0`)                 | 必須     | デプロイ環境                      | -                                    | -                                                    |
| `REDIS_PASSWORD`              | Redisパスワード                                     | 必須     | 秘密管理基盤                      | 半年                                 | 即時失効                                             |
| `REDIS_TLS`                   | Redis TLS有効化(`true`/`false`)                     | 必須     | `true`(prod)                      | -                                    | -                                                    |
| `S3_ENDPOINT`                 | MinIO/S3互換エンドポイント                          | 必須     | デプロイ環境                      | -                                    | -                                                    |
| `S3_REGION`                   | リージョン名(`us-east-1`等)                         | 必須     | デプロイ環境                      | -                                    | -                                                    |
| `S3_BUCKET_IMAGES`            | 画像バケット名(`docs-images`)                       | 必須     | `docs-images`                     | -                                    | -                                                    |
| `S3_BUCKET_EXPORTS`           | エクスポートバケット名(`docs-exports`)              | 必須     | `docs-exports`                    | -                                    | -                                                    |
| `S3_ACCESS_KEY`               | S3アクセスキー                                      | 必須     | 秘密管理基盤                      | 半年                                 | 即時失効                                             |
| `S3_SECRET_KEY`               | S3シークレットキー                                  | 必須     | 秘密管理基盤                      | 半年                                 | 即時失効                                             |
| `S3_FORCE_PATH_STYLE`         | MinIO用Path-style強制(`true`)                       | 必須     | `true`                            | -                                    | -                                                    |
| `SMTP_HOST`                   | SMTPホスト(メール送信)                              | 必須     | デプロイ環境                      | -                                    | -                                                    |
| `SMTP_PORT`                   | SMTPポート(`587`)                                   | 必須     | `587`                             | -                                    | -                                                    |
| `SMTP_USER`                   | SMTPユーザー                                        | 必須     | デプロイ環境                      | -                                    | -                                                    |
| `SMTP_PASSWORD`               | SMTPパスワード                                      | 必須     | 秘密管理基盤                      | 半年                                 | 即時失効                                             |
| `MAIL_FROM`                   | 送信元アドレス(`noreply@example.com`)               | 必須     | デプロイ環境                      | -                                    | -                                                    |
| `HIBP_API_TIMEOUT_MS`         | Have I Been Pwned APIタイムアウト(`3000`)           | 必須     | `3000`                            | -                                    | -                                                    |
| `EXPORT_WORKER_REPLICAS`      | エクスポートワーカーレプリカ数(`2`)                 | 必須     | `2`                               | -                                    | -                                                    |
| `EXPORT_WORKER_CONCURRENCY`   | プロセス内同時実行(`EXP_PROC_CONCURRENCY` と同値=2) | 必須     | `2`                               | -                                    | -                                                    |
| `PREVIEW_URL`                 | CI ZAPプレビュー環境URL(PRごと)                     | CI時必須 | CI動的生成                        | -                                    | -                                                    |
| `IMAGE_TAG`                   | コンテナイメージタグ(SHA)                           | CI時必須 | CI動的生成                        | -                                    | -                                                    |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry送信先(将来拡張、本MVPはオフ)          | 任意     | (空)                              | -                                    | -                                                    |
| `LOKI_PUSH_URL`               | Loki push API URL                                   | 必須     | デプロイ環境                      | -                                    | -                                                    |
| `LOKI_BEARER_TOKEN`           | Loki Bearer Token                                   | 必須     | 秘密管理基盤                      | 半年                                 | 即時失効                                             |
| `PROXY_REJECT_BEARER_TOKEN`   | 内部proxy-reject-batch認証                          | 必須     | 秘密管理基盤                      | 四半期                               | 即時失効                                             |

## `.env.example` 雛形

```env
NODE_ENV=development
LOG_LEVEL=debug
APP_BASE_URL=http://localhost:3000
SESSION_COOKIE_DOMAIN=localhost

SESSION_SECRET=replace-with-32-byte-random
CSRF_SECRET=replace-with-32-byte-random
CACHE_ETAG_SECRET=replace-with-32-byte-random
IP_HASH_SECRET=replace-with-32-byte-random
GUEST_WS_TOKEN_SECRET=replace-with-32-byte-random
AUDIT_HASH_SALT_v1=replace-with-32-byte-random
AUDIT_CURRENT_SALT_VERSION=1

DB_HOST=localhost
DB_PORT=5432
DB_NAME=wysiwyg_collab
DB_USER=wysiwyg
DB_PASSWORD=replace
DB_POOL_MAX=20
DB_SSL_MODE=disable

REDIS_URL=redis://localhost:6379/0
REDIS_PASSWORD=
REDIS_TLS=false

S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET_IMAGES=docs-images
S3_BUCKET_EXPORTS=docs-exports
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_FORCE_PATH_STYLE=true

SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=noreply@localhost

HIBP_API_TIMEOUT_MS=3000

EXPORT_WORKER_REPLICAS=1
EXPORT_WORKER_CONCURRENCY=2

LOKI_PUSH_URL=http://localhost:3100/loki/api/v1/push
LOKI_BEARER_TOKEN=
PROXY_REJECT_BEARER_TOKEN=replace
```

## 起動時バリデーション契約

サーバー起動時に全必須キーの存在をzodで検証し、欠落時はexit code 1で停止する。

```ts
// apps/server/src/config/env.ts(雛形)
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]),
  APP_BASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  CACHE_ETAG_SECRET: z.string().min(32),
  IP_HASH_SECRET: z.string().min(32),
  GUEST_WS_TOKEN_SECRET: z.string().min(32),
  AUDIT_CURRENT_SALT_VERSION: z.coerce.number().int().min(1),
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().int(),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().min(1),
  DB_SSL_MODE: z.enum(["require", "disable", "prefer"]),
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string(),
  REDIS_TLS: z.coerce.boolean(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string(),
  S3_BUCKET_IMAGES: z.string(),
  S3_BUCKET_EXPORTS: z.string(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean(),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().int(),
  MAIL_FROM: z.string().email(),
  EXPORT_WORKER_CONCURRENCY: z.coerce.number().int().min(1),
  LOKI_PUSH_URL: z.string().url(),
  PROXY_REJECT_BEARER_TOKEN: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Env validation failed:", result.error.format());
    process.exit(1);
  }
  return result.data;
}
```

`AUDIT_HASH_SALT_v{N}` は動的キーのため `envSchema` には含めず、別途 `loadAuditSalts(currentVersion: number): Map<number, string>` で検証する。

## エラーコード

| コード    | 起動失敗 | 意味                                                        |
| --------- | -------- | ----------------------------------------------------------- |
| `ENV-001` | exit 1   | 必須環境変数の欠落                                          |
| `ENV-002` | exit 1   | `AUDIT_HASH_SALT_v{N}` の欠落(N=AUDIT_CURRENT_SALT_VERSION) |
| `ENV-003` | exit 1   | 秘密鍵の長さ不足(32バイト未満)                              |

## テストID紐付け

| 契約ID          | 内容                                           | テストID  | テスト種別 | CIゲート |
| --------------- | ---------------------------------------------- | --------- | ---------- | -------- |
| ENV-CONTRACT-01 | 必須キー欠落でexit 1 ENV-001                   | T-ENV-001 | unit       | Vitest   |
| ENV-CONTRACT-02 | 秘密鍵32バイト未満でexit 1 ENV-003             | T-ENV-002 | unit       | Vitest   |
| ENV-CONTRACT-03 | 現salt_versionに対応する鍵欠落でexit 1 ENV-002 | T-ENV-003 | unit       | Vitest   |
| ENV-CONTRACT-04 | `.env.example` と `envSchema` の網羅性突合     | T-ENV-004 | unit       | Vitest   |

## トレーサビリティ

| 対応要件                                                 | 対応基本設計節 | 対応ADR |
| -------------------------------------------------------- | -------------- | ------- |
| NFR-04(セキュリティの秘密管理)、NFR-07(運用の起動時診断) | §7、§9         | -       |
