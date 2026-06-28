# 22ディレクトリ所有マップ

## スコープ

モノレポ全体のディレクトリ構造、各ドメイン章が所有するファイル群、ファイル命名規約、テストファイル配置規約を集約する。これにより詳細設計の各章とソースファイルが1対1で対応し、並行開発時の衝突を回避する。

## モノレポ全体構造

```text
.
├── apps/
│   ├── web/                       # フロントエンドSPA(Vite+)
│   │   ├── src/
│   │   │   ├── main.ts            # エントリ
│   │   │   ├── app.tsx
│   │   │   ├── features/          # ドメイン章別
│   │   │   │   ├── auth/          # 詳細03担当
│   │   │   │   ├── editor/        # 詳細04担当
│   │   │   │   ├── suggestion/    # 詳細05担当
│   │   │   │   ├── comment/       # 詳細05b担当
│   │   │   │   ├── version/       # 詳細06担当
│   │   │   │   ├── export/        # 詳細07担当
│   │   │   │   ├── image/         # 詳細08担当
│   │   │   │   ├── share-link/    # 詳細09担当
│   │   │   │   ├── offline/       # 詳細10担当
│   │   │   │   ├── document/      # 詳細11担当
│   │   │   │   ├── admin/         # 詳細12担当
│   │   │   │   └── a11y-palette/  # 詳細17担当
│   │   │   ├── shared/            # 横断ユーティリティ
│   │   │   │   ├── api-client/    # 詳細02 共通エンベロープ消費
│   │   │   │   ├── error/         # 詳細19 メッセージ展開
│   │   │   │   ├── i18n/          # 詳細17
│   │   │   │   └── sw/            # ServiceWorker(詳細10)
│   │   │   └── styles/
│   │   ├── tests/                 # *.test.ts(Vitest)
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── vitest.config.ts
│   │   └── tsconfig.json
│   ├── server/                    # アプリケーションサーバー(Express + ShareDB)
│   │   ├── src/
│   │   │   ├── main.ts            # エントリ
│   │   │   ├── config/
│   │   │   │   ├── env.ts         # 詳細21
│   │   │   │   └── secrets.ts     # AUDIT_HASH_SALT世代管理(詳細14)
│   │   │   ├── features/          # ドメイン章別
│   │   │   │   ├── auth/          # 詳細03担当
│   │   │   │   ├── realtime/      # 詳細04担当(ShareDBフック含む)
│   │   │   │   ├── suggestion/    # 詳細05担当
│   │   │   │   ├── comment/       # 詳細05b担当
│   │   │   │   ├── version/       # 詳細06担当
│   │   │   │   ├── export/        # 詳細07担当(クライアント、SQS取得とジョブ投入)
│   │   │   │   ├── image/         # 詳細08担当
│   │   │   │   ├── share-link/    # 詳細09担当
│   │   │   │   ├── offline-etag/  # 詳細10担当(サーバー応答時のcache_etag算出)
│   │   │   │   ├── document/      # 詳細11担当
│   │   │   │   ├── admin/         # 詳細12担当
│   │   │   │   ├── csp/           # 詳細13担当(/api/csp-report含む)
│   │   │   │   ├── audit/         # 詳細14担当
│   │   │   │   ├── rate-limit/    # 詳細15担当
│   │   │   │   └── monitoring/    # 詳細16担当(/metrics, /healthz)
│   │   │   ├── shared/            # 共通モジュール(詳細27)
│   │   │   │   ├── api/           # ルーター登録、エンベロープ
│   │   │   │   ├── auth-middleware/
│   │   │   │   ├── permissions/   # 共通認可関数(ADR-0010)
│   │   │   │   ├── csrf-middleware/
│   │   │   │   ├── logger/        # pino
│   │   │   │   ├── metrics/       # prom-client
│   │   │   │   ├── tracing/       # request_id伝播
│   │   │   │   ├── db/            # pg pool、トランザクション
│   │   │   │   ├── redis/         # ioredisクライアント
│   │   │   │   ├── s3/            # MinIOクライアント
│   │   │   │   ├── mail/          # nodemailer
│   │   │   │   ├── error/         # ApiError, toErrorEnvelope
│   │   │   │   └── audit-emit/    # audit_logs INSERT契約
│   │   │   ├── sharedb/           # ShareDBサーバー設定とフック
│   │   │   └── routes/            # 各featureのルーター登録
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   └── integ/             # testcontainers使用
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   └── export-worker/             # エクスポートワーカー(詳細07)
│       ├── src/
│       │   ├── main.ts
│       │   ├── poll.ts            # DBポーリング(CTE+FOR UPDATE SKIP LOCKED)
│       │   ├── reaper.ts          # 孤児ジョブ復旧
│       │   ├── workers/
│       │   │   ├── pdf.ts         # Playwright
│       │   │   ├── docx.ts        # docx
│       │   │   └── markdown.ts    # unified
│       │   └── heartbeat.ts
│       ├── tests/
│       └── tsconfig.json
├── packages/
│   ├── shared/                    # クライアント・サーバー共有
│   │   ├── src/
│   │   │   ├── api-schemas/       # 詳細25 zodスキーマ(全API契約)
│   │   │   ├── error-codes/       # 詳細19 から自動生成
│   │   │   ├── constants/         # 詳細20 から自動生成
│   │   │   ├── palette/           # 詳細17 16色パレット
│   │   │   └── delta-types/       # Quill Delta型エクスポート
│   │   └── tsconfig.json
│   └── doc-canonical/             # 詳細14 record_canonical + json-canonicalize wrapper
│       └── src/
├── e2e/                           # Playwright E2E(詳細28)
│   ├── tests/
│   │   ├── auth.spec.ts
│   │   ├── editor.spec.ts
│   │   ├── suggestion.spec.ts
│   │   ├── version.spec.ts
│   │   ├── export.spec.ts
│   │   ├── image.spec.ts
│   │   ├── share-link.spec.ts
│   │   ├── offline.spec.ts
│   │   ├── document.spec.ts
│   │   ├── admin.spec.ts
│   │   ├── a11y.spec.ts           # 詳細17 + axe
│   │   └── csp.spec.ts
│   ├── fixtures/
│   │   ├── users.ts
│   │   ├── documents.ts
│   │   └── seed.ts
│   ├── playwright.config.ts
│   └── tsconfig.json
├── migrations/                    # 詳細24 node-pg-migrate
│   ├── 1700000010_users.sql
│   ├── 1700000020_user_roles.sql
│   └── ...
├── manifests/                     # 詳細29 Kubernetes
│   ├── base/
│   │   ├── namespace.yaml
│   │   ├── app-server-deployment.yaml
│   │   ├── export-worker-deployment.yaml
│   │   ├── services.yaml
│   │   ├── ingress.yaml
│   │   ├── network-policies.yaml
│   │   ├── secrets.yaml.example
│   │   └── configmap.yaml
│   ├── overlays/
│   │   ├── staging/
│   │   └── production/
│   └── alerts/                    # Prometheus AlertManagerルール(詳細16)
├── tools/
│   ├── auto_fix_docs.py
│   ├── lint_docs.py
│   ├── traceability_check.mjs     # 詳細26 CIで実行
│   └── seed-local.mjs             # 詳細30
├── docker/
│   ├── app-server.Dockerfile      # Distroless
│   └── export-worker.Dockerfile   # debian-slim + Playwright
├── docker-compose.yml             # 詳細30 ローカル開発
├── .github/
│   └── workflows/
│       ├── ci.yml                 # 詳細26
│       ├── dast-zap-full.yml      # 週次(詳細18)
│       └── release.yml            # 詳細33相当(本MVPはci.ymlに統合)
├── .gitleaks.toml                 # 詳細23
├── .semgrep.yml                   # 詳細23
├── .nvmrc                         # 詳細23
├── trivy.yaml                     # 詳細23
├── zap-baseline.conf              # 詳細23
├── pnpm-workspace.yaml
├── package.json                   # ルートmonorepo manifest
├── tsconfig.base.json
├── README.md
└── .env.example                   # 詳細21
```

## 章×ファイル所有マップ(主要)

| 詳細章           | 主な所有ディレクトリ                                                                              | 主な所有ファイル例                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 03 auth          | `apps/server/src/features/auth/`、`apps/web/src/features/auth/`                                   | `login.ts`、`logout.ts`、`password-reset.ts`、`email-verify.ts`、`session-middleware.ts` |
| 04 OT realtime   | `apps/server/src/features/realtime/`、`apps/server/src/sharedb/`、`apps/web/src/features/editor/` | `sharedb-server.ts`、`verify-client.ts`、`ack-seq-repository.ts`、`reconnect.ts`         |
| 05 suggestion    | `apps/server/src/features/suggestion/`、`apps/web/src/features/suggestion/`                       | `accept.ts`(二段CAS)、`reject.ts`、`expire-batch.ts`                                     |
| 05b comments     | `apps/server/src/features/comment/`、`apps/web/src/features/comment/`                             | `create.ts`、`reply.ts`、`resolve.ts`                                                    |
| 06 version/ops   | `apps/server/src/features/version/`                                                               | `auto-version-scheduler.ts`、`compact.ts`、`purge-batch.ts`、`restore.ts`                |
| 07 export        | `apps/export-worker/`、`apps/server/src/features/export/`                                         | `poll.ts`、`reaper.ts`、`pdf.ts`、`docx.ts`、`markdown.ts`                               |
| 08 image         | `apps/server/src/features/image/`                                                                 | `upload.ts`、`thumbnail.ts`、`purge-batch.ts`                                            |
| 09 share-link    | `apps/server/src/features/share-link/`                                                            | `create.ts`、`access.ts`、`revoke.ts`、`guest-ws-token.ts`                               |
| 10 offline       | `apps/web/src/features/offline/`、`apps/server/src/features/offline-etag/`                        | `cache-etag.ts`(server算出)、`sw.ts`(client)、`workbox.config.ts`                        |
| 11 document      | `apps/server/src/features/document/`                                                              | `create.ts`、`patch.ts`、`delete.ts`、`restore.ts`、`list.ts`、`purge-batch.ts`          |
| 12 cs-ops        | `apps/server/src/features/admin/`                                                                 | `roles.ts`、`audit-log-view.ts`、`secret-rotate.ts`                                      |
| 13 CSP/sanitize  | `apps/server/src/features/csp/`                                                                   | `csp-report.ts`、`csp-middleware.ts`、`sanitize.ts`                                      |
| 14 audit         | `apps/server/src/features/audit/`、`packages/doc-canonical/`                                      | `emit.ts`、`verify-batch.ts`、`canonical.ts`                                             |
| 15 rate-limit    | `apps/server/src/features/rate-limit/`                                                            | `middleware.ts`、`rules.ts`                                                              |
| 16 BCP           | `apps/server/src/features/monitoring/`、`manifests/alerts/`                                       | `metrics.ts`、`healthz.ts`、`alerts.yml`                                                 |
| 17 a11y/palette  | `apps/web/src/features/a11y-palette/`、`packages/shared/src/palette/`                             | `palette.ts`、`contrast.ts`、`build-csp-hashes.ts`                                       |
| 18 CI gates      | `.github/workflows/`、`tools/traceability_check.mjs`                                              | `ci.yml`、`dast-zap-full.yml`                                                            |
| 19 errors        | `packages/shared/src/error-codes/`                                                                | `codes.ts`(自動生成元), `messages.ts`                                                    |
| 20 constants     | `packages/shared/src/constants/`                                                                  | `constants.ts`(自動生成元)                                                               |
| 21 env           | `apps/server/src/config/env.ts`、`apps/export-worker/src/config/env.ts`                           | `env.ts`、`.env.example`                                                                 |
| 22 directory     | (本ファイル)                                                                                      | -                                                                                        |
| 23 config files  | (各root config)                                                                                   | -                                                                                        |
| 24 migrations    | `migrations/`、`tools/migrate.mjs`                                                                | `1700000010_users.sql`〜                                                                 |
| 25 zod schemas   | `packages/shared/src/api-schemas/`                                                                | `auth.ts`、`document.ts`、`suggestion.ts`、`export.ts`、...                              |
| 26 CI YAML       | `.github/workflows/ci.yml`                                                                        | (本ファイル)                                                                             |
| 27共通モジュール | `apps/server/src/shared/`、`apps/web/src/shared/`                                                 | `logger.ts`、`metrics.ts`、`permissions.ts`、`api-error.ts`、`envelope.ts`               |
| 28テスト規約     | `*/tests/`、`e2e/`                                                                                | テスト雛形                                                                               |
| 29 k8s manifest  | `manifests/`                                                                                      | (詳細29で確定)                                                                           |
| 30ローカル開発   | `docker-compose.yml`、`tools/seed-local.mjs`                                                      | (詳細30で確定)                                                                           |

## ファイル命名規約

- TypeScript: `kebab-case.ts`(関数/型はファイル内で `camelCase`/`PascalCase`)
- テスト: 対象ファイル名+ `.test.ts`(unit)または `.integ.ts`(integ)
- E2E: `<feature>.spec.ts`
- マイグレーション: `<unix_seconds>_<snake_case>.sql`
- React component: `PascalCase.tsx`
- hooks: `use-<name>.ts`

## ESLint境界規則

`eslint-plugin-boundaries` で以下を強制する。

- `apps/server/src/features/X/` から `apps/server/src/features/Y/`(X≠Y)への直接importを禁止(章間連携はイベント/APIのみ)。
- `packages/shared/` は全アプリから参照可、逆方向は禁止。
- `apps/web/` から `apps/server/` への直接import禁止。
- `apps/export-worker/` から `apps/server/src/features/` への直接import禁止(共有は `packages/shared/` 経由)。

## エラーコード

| コード    | HTTP/exit | 意味               |
| --------- | --------- | ------------------ |
| `DIR-001` | CI失敗    | ESLint境界規則違反 |

## テストID紐付け

| 契約ID          | 内容                          | テストID  | テスト種別                    | CIゲート                   |
| --------------- | ----------------------------- | --------- | ----------------------------- | -------------------------- |
| DIR-CONTRACT-01 | features章間の直接import禁止  | T-DIR-001 | meta(eslint)                  | `check-server`/`check-web` |
| DIR-CONTRACT-02 | `packages/shared/` 一方向参照 | T-DIR-002 | meta(eslint)                  | 同上                       |
| DIR-CONTRACT-03 | ファイル命名規約遵守          | T-DIR-003 | meta(eslint/file-naming-rule) | 同上                       |

## トレーサビリティ

| 対応要件             | 対応基本設計節 | 対応ADR  |
| -------------------- | -------------- | -------- |
| 全FR/NFRの所有マップ | §8             | ADR-0028 |
