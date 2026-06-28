# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-06-28T05:31:01.843Z
> Files: 175 tracked | Anatomy hits: 0 | Misses: 0

## ../../../.claude/projects/-Users-yujiokamoto-devs-typescript-wysiwyg-collab-editor/memory/

- `feedback_code_review_reply_per_item.md` (~195 tok)
- `feedback_verify_in_browser.md` (~211 tok)
- `MEMORY.md` (~131 tok)
- `project_collab_websocket_arch.md` — 配線 (~491 tok)
- `reference_pdf_lib_cjk_subset_bug.md` (~198 tok)

## ./

- `.DS_Store` (~1640 tok)
- `.gitignore` — Ignores dependency, build, coverage, Playwright, local env, OS/editor, and scanner output files. (~130 tok)
- `.nvmrc` — Node.js major version pin for local development and CI parity. (~1 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)
- `package.json` — Node.js package manifest (~381 tok)
- `pnpm-lock.yaml` — pnpm dependency lockfile generated from the initial workspace manifests. (~3650 tok)
- `pnpm-workspace.yaml` — pnpm workspace package globs for apps, packages, and e2e. (~12 tok)
- `README.md` — Japanese project overview, setup commands, quality gates, and workspace directory guide. (~330 tok)
- `tsconfig.base.json` — Shared strict TypeScript compiler options for all workspaces. (~130 tok)

## ./apps/export-worker/

- `package.json` — Export worker package manifest with dev, build, test, and check scripts. (~95 tok)
- `tsconfig.json` — Export worker TypeScript config extending the root base config. (~75 tok)

## ./apps/export-worker/src/

- `main.ts` — Minimal export worker process entrypoint scaffold. (~25 tok)

## ./apps/server/

- `package.json` — Server package manifest for Express entrypoint development and checks. (~105 tok)
- `tsconfig.json` — Server TypeScript config extending the root base config. (~80 tok)
- `vitest.config.ts` — Server Vitest configuration with node environment and coverage defaults. (~145 tok)

## ./apps/server/src/

- `main.ts` — Express app entrypoint exposing health/metrics scaffolds with Helmet security headers. (~120 tok)

## ./apps/web/

- `index.html` — Vite HTML entry document mounting the React root. (~45 tok)
- `package.json` — Web app package manifest for Vite, React, PWA plugin, tests, and checks. (~140 tok)
- `tsconfig.json` — Web TypeScript config with React JSX and Vite client types. (~80 tok)
- `vite.config.ts` — Vite React and PWA configuration with documented dev port and cache strategies. (~200 tok)
- `vitest.config.ts` — Web Vitest configuration with jsdom environment and coverage defaults. (~145 tok)

## ./apps/web/src/

- `app.tsx` — Localized React editor shell with BroadcastChannel draft sync, sanitized contenteditable controls, panels, save state, lazy export downloads, and responsive accessible labels. (~620 tok)
- `exporters.ts` — Browser PDF/DOCX/Markdown export generation with Noto Sans JP PDF embedding and rich-text format conversion. (~1450 tok)
- `main.tsx` — React root bootstrap and global stylesheet import. (~70 tok)
- `rich-text.ts` — Lightweight rich-text HTML sanitizer for editor rendering and persisted drafts. (~420 tok)

## ./apps/web/src/styles/

- `global.css` — Responsive editor, rail, side panel, presence, and rich-text toolbar styles for desktop/mobile layouts. (~760 tok)

## .claude/

- `settings.json` (~441 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## .github/workflows/

- `ci.yml` — CI: ci (~617 tok)
- `dast-zap-full.yml` — CI: dast-zap-full (~212 tok)

## apps/server/

- `package.json` — Node.js package manifest (~230 tok)

## apps/server/src/

- `main.ts` — API routes: GET (2 endpoints) (~1667 tok)

## apps/server/src/config/

- `env.ts` — サーバー起動時の環境変数スキーマ、byte長秘密鍵検証、ENV-001/003変換を定義する。 (~930 tok)
- `secrets.ts` — AUDIT_HASH_SALT_vN の動的読込と現行salt存在/byte長検証を定義する。 (~320 tok)

## apps/server/src/shared/api/

- `envelope.ts` — REST共通成功/失敗エンベロープ生成と送信ヘルパーを定義する。 (~560 tok)

## apps/server/src/shared/audit-emit/

- `index.ts` — audit_logsハッシュチェーン追記、advisory lock、JCS正規化、secret_versions更新を担う。 (~1150 tok)

## apps/server/src/shared/auth-middleware/

- `index.ts` — セッション/ゲストCookie名、ゲストWSサブプロトコル抽出、認証コンテキスト型を置く。 (~260 tok)

## apps/server/src/shared/csrf-middleware/

- `index.ts` — CSRFヘッダ/Cookie名とCSPレポート例外パス判定を置く。 (~100 tok)

## apps/server/src/shared/db/

- `pool.ts` — pg Pool生成と共通トランザクションヘルパーを定義する。 (~310 tok)

## apps/server/src/shared/error/

- `api-error.ts` — 共通APIエラー型とHTTPステータス/詳細情報を定義する。 (~120 tok)

## apps/server/src/shared/logger/

- `index.ts` — pino logger、ログレベル環境変数、秘密情報redact、child loggerを定義する。 (~280 tok)

## apps/server/src/shared/metrics/

- `index.ts` — prom-clientの既定収集、REST/OT/WS/容量/CSP/ログdropメトリクスを定義する。 (~520 tok)

## apps/server/src/shared/permissions/

- `check.ts` — owner/editor/commenter/viewer順序でユーザー/ゲスト/システムの文書権限を判定する。 (~520 tok)

## apps/server/src/shared/redis/

- `client.ts` — ioredisクライアントを環境変数から生成する。 (~130 tok)

## apps/server/src/shared/s3/

- `client.ts` — S3互換クライアントと画像/エクスポートバケット名を環境変数から生成する。 (~180 tok)

## apps/server/src/shared/tracing/

- `request-id.ts` — x-request-id応答ヘッダとtrace_idを付与するExpress middleware。 (~210 tok)

## apps/server/tests/

- `draft-collab.test.ts` — Server: startServer, openClient, closeQuiet (~2496 tok)

## apps/web/

- `package.json` — Node.js package manifest (~235 tok)
- `vite.config.ts` — Attach the collab WebSocket directly to Vite's HTTP server so the browser (~592 tok)

## apps/web/src/

- `app.tsx` — draftStorageKey (~6481 tok)
- `exporters.ts` — Exports ExportFormat, DraftExportInput, sanitizeRichTextHtml, createExportBlob, exportFilename (~2970 tok)

## apps/web/tests/

- `app.test.tsx` — input (~1045 tok)

## docs/

- `.DS_Store` (~1640 tok)

## docs/\_quality/

- `IMPROVEMENT_BACKLOG.md` — 改善バックログ バージョン1.5 (~1340 tok)
- `QUALITY_RUBRIC.md` — QUALITY_RUBRICバージョン1.4 (~1516 tok)
- `SELF_REVIEW_LOG.md` — SELF_REVIEW_LOGバージョン1.8 (~1989 tok)
- `STYLE_GUIDE.md` — STYLE_GUIDEバージョン1.2 (~984 tok)

## docs/design/

- `.DS_Store` (~1640 tok)
- `03-basic-design.md` — 基本設計書 (~15903 tok)

## docs/design/adr/

- `ADR-0001-同時編集の整合性方式としてOTを採用する.md` — ADR-0001 同時編集の整合性方式として操作変換(OT)を採用する (~823 tok)
- `ADR-0002-OT実装基盤としてShareDBを採用する.md` — ADR-0002 OT実装基盤としてShareDBを採用する (~771 tok)
- `ADR-0003-WYSIWYGエディタとしてQuill.jsを採用する.md` — ADR-0003 WYSIWYGエディタとしてQuill.jsを採用する (~900 tok)
- `ADR-0004-永続化基盤としてPostgreSQLに統一する.md` — ADR-0004 永続化基盤としてPostgreSQLに統一する (~732 tok)
- `ADR-0005-複数サーバー間のOT同期にRedis Pub-Subを採用する.md` — ADR-0005 複数アプリケーションサーバー間のOT同期にRedis Pub/Subを採用する (~789 tok)
- `ADR-0006-認証方式としてセッションCookieを採用する.md` — ADR-0006 認証方式としてメールパスワードによるセッションCookieを採用する (~1196 tok)
- `ADR-0007-画像保存にS3互換オブジェクトストレージを採用する.md` — ADR-0007 画像と添付ファイルの保存にS3互換オブジェクトストレージ(MinIO)を採用する (~738 tok)
- `ADR-0008-フロントエンド基盤としてVite-Plusを採用する.md` — ADR-0008 フロントエンドの開発と本番ビルドの基盤としてVite+を採用する (~748 tok)
- `ADR-0009-CI品質ゲートを4種類に固定する.md` — ADR-0009 CI上の品質ゲートをgitleaks、migrate-dryrun、Vite+フォーマッタとlinter、Vite+標準のテストランナー、Playwrightの5種類に固定する (~1178 tok)
- `ADR-0010-認可をREST層とWebSocket層の二重で判定する.md` — ADR-0010 認可判定をREST層とWebSocket層の二重で実施する (~1110 tok)
- `ADR-0011-提案モードを本文OTから分離する.md` — ADR-0011 提案モードを本文のOTから分離して管理する (~1439 tok)
- `ADR-0012-オフラインを閲覧のみに限定する.md` — ADR-0012 オフライン対応を閲覧のみに限定しServiceWorkerで実現する (~858 tok)
- `ADR-0013-エクスポートをPDFとDOCXとMarkdownの3形式に固定する.md` — ADR-0013 エクスポート形式をPDF、DOCX、Markdownの3種類に固定する (~996 tok)
- `ADR-0014-主キーにUUID v7を採用する.md` — ADR-0014 業務テーブルの主キーにUUID v7を採用する (~638 tok)
- `ADR-0015-アプリケーションサーバーを単一プロセスで構成する.md` — ADR-0015 アプリケーションサーバーをHTTPとWebSocketの単一プロセスで構成する (~871 tok)
- `ADR-0016-版履歴は1000版上限とし自動圧縮を行う.md` — ADR-0016 版履歴は1文書あたり1000版を上限とし自動圧縮を行う (~787 tok)
- `ADR-0017-CSP方針.md` — ADR-0017 Content-Security-Policy方針 (~567 tok)
- `ADR-0018-監査ログ設計.md` — ADR-0018 監査ログの保存期間と改ざん防止 (~466 tok)
- `ADR-0019-バックアップ戦略.md` — ADR-0019 バックアップ戦略 (~352 tok)
- `ADR-0020-DR-RTO-RPO方針.md` — ADR-0020 災害復旧の目標値 (~294 tok)
- `ADR-0021-監視と可観測性.md` — ADR-0021 監視と可観測性の方針 (~347 tok)
- `ADR-0022-i18n方針.md` — ADR-0022 国際化の範囲 (~329 tok)
- `ADR-0023-アクセシビリティ方針.md` — ADR-0023 アクセシビリティの水準 (~329 tok)
- `ADR-0024-画像処理ライブラリ選定.md` — ADR-0024 画像処理ライブラリにSharpを採用する (~348 tok)
- `ADR-0025-マイグレーションツール選定.md` — ADR-0025 マイグレーションツールにnode-pg-migrateを採用する (~379 tok)
- `ADR-0026-サニタイズ方針.md` — ADR-0026 入力サニタイズの方針 (~351 tok)
- `ADR-0027-レートリミット詳細.md` — ADR-0027 レートリミットの実装と適用範囲 (~345 tok)
- `ADR-0028-デプロイ単位とコンテナ基盤.md` — ADR-0028 デプロイ単位とコンテナ基盤 (~516 tok)
- `README.md` — Project documentation (~975 tok)

## docs/design/detailed/

- `_template.md` — 詳細設計章テンプレート (~302 tok)
- `00-README.md` — 詳細設計 (~1132 tok)
- `01-data-model-ddl.md` — 01データモデル所有マップ (~827 tok)
- `02-api-contracts.md` — 02 API共通契約 (~513 tok)
- `03-auth-session-csrf.md` — 03認証・セッション・CSRF・WSサブプロトコル (~831 tok)
- `05-suggestion-two-phase-cas.md` — 05提案モード二段CAS (~1113 tok)
- `07-export-pipeline.md` — 07エクスポートパイプライン (~1280 tok)
- `09-share-link-and-guest.md` — 09共有リンクとゲストセッション (~922 tok)
- `11-document-lifecycle.md` — 11文書ライフサイクルと物理削除 (~1269 tok)
- `12-support-cs-operations.md` — 12サポート運用範囲 (~908 tok)
- `13-csp-and-sanitization.md` — 13 CSPとサニタイズ (~793 tok)
- `14-audit-log-hash-chain.md` — 14監査ログとハッシュチェーン (~1257 tok)
- `16-backup-dr-monitoring.md` — 16バックアップ・DR・監視 (~900 tok)
- `17-i18n-a11y-palette.md` — 17 i18n・アクセシビリティ・カラーパレット (~817 tok)
- `18-ci-quality-gates.md` — 18 CI品質ゲート (~979 tok)
- `19-error-code-registry.md` — 19 エラーコード登録簿。章接頭辞ごとのHTTP/運用コードと日英メッセージのソースオブトゥルース。 (~3382 tok)
- `20-constants-registry.md` — 20 定数登録簿。認証、監査、レート制限、容量、ランタイム/ライブラリの固定値を集約する。 (~2608 tok)
- `21-environment-variables.md` — 21環境変数契約 (~900 tok)
- `22-directory-and-module-ownership.md` — 22 ディレクトリとモジュール所有境界。編集対象と禁止領域の対応表を定義する。 (~820 tok)
- `23-config-file-templates.md` — 23設定ファイルテンプレート (~900 tok)
- `23-config-file-templates.md` — 23 ルートとアプリ別の package/tsconfig/Vite/Vitest 設定テンプレートを定義する。 (~2650 tok)
- `24-migrations.md` — 24マイグレーション設計 (~900 tok)
- `26-ci-yaml.md` — 26 CI YAML設計 (~900 tok)
- `27-shared-modules.md` — 27 shared パッケージと各アプリからの利用契約、import 境界を定義する。 (~1040 tok)
- `28-test-strategy.md` — 28テスト戦略 (~900 tok)
- `29-kubernetes-manifests.md` — 29 Kubernetesマニフェスト設計 (~900 tok)
- `30-local-development.md` — 30ローカル開発設計 (~900 tok)
- `30-local-development.md` — 30 ローカル開発手順、起動コマンド、ポート、ヘルスチェックを定義する。 (~890 tok)

## docs/requirements/

- `01-requirements-analysis.md` — 要求分析書 (~2740 tok)
- `02-requirements-specification.md` — 要件定義書 (~9484 tok)

## operations-infra/

- `.env.example` — Environment variable template matching detailed design 21. (~420 tok)
- `.github/workflows/ci.yml` — Minimal CI workflow for secret scan, migration dry run, traceability, doclint, and Trivy. (~650 tok)
- `.github/workflows/dast-zap-full.yml` — Scheduled/manual ZAP full scan workflow. (~240 tok)
- `.gitleaks.toml` — Secret scanning rules and allowlists for CI. (~230 tok)
- `.semgrep.yml` — Semgrep ruleset selection and SAST exclusions. (~150 tok)
- `.semgrep.yml` — Semgrep path/severity exclusions; registry rules are passed from the root `security:owasp` script. (~80 tok)
- `apps/export-worker/src/main.test.ts` — Export-worker poll interval parser tests. (~90 tok)
- `apps/export-worker/vitest.config.ts` — Export-worker Vitest config excluding dist. (~80 tok)
- `apps/server/tests/main.test.ts` — Server Vitest health-check smoke test using createApp. (~220 tok)
- `apps/web/tests/app.test.tsx` — Web Vitest smoke test for the editor shell. (~80 tok)
- `docker-compose.yml` — Local PostgreSQL, Redis, MinIO, and MailCatcher services. (~640 tok)
- `docker/app-server.Dockerfile` — App server production image build contract. (~230 tok)
- `docker/export-worker.Dockerfile` — Export worker image with Playwright runtime dependencies. (~300 tok)
- `e2e/fixtures/users.ts` — E2E seed user constants matching local seed contract. (~180 tok)
- `e2e/package.json` — E2E package manifest and warning-free Playwright test script. (~90 tok)
- `e2e/playwright.config.ts` — Playwright projects/reporters/baseURL config with exactOptionalPropertyTypes-safe workers setting. (~260 tok)
- `e2e/tests/editor-ux.spec.ts` — Cross-browser E2E coverage for edit/save, panels, en/ja locale, viewport overflow, two-user draft sync, rich-text decoration, executable-markup sanitization, and PDF/DOCX/Markdown export file validation. (~1500 tok)
- `e2e/tsconfig.json` — Strict TypeScript config for Playwright specs and config. (~80 tok)
- `manifests/**` — Kustomize base/overlays and Prometheus alert manifests for app-server/export-worker. (~3200 tok)
- `trivy.yaml` — Trivy filesystem/container scan policy. (~90 tok)
- `vite.config.ts` — Root Vite+ config for Oxfmt formatting and ignore patterns. (~150 tok)
- `zap-baseline.conf` — OWASP ZAP baseline rule dispositions. (~60 tok)

## packages/doc-canonical/

- `package.json` — doc-canonical package manifest and export declaration. (~100 tok)
- `tsconfig.json` — standalone strict TypeScript config for canonical wrapper compilation. (~120 tok)

## packages/doc-canonical/src/

- `index.ts` — audit record canonical shape, required key order, NFC/JCS-style canonical JSON wrapper, and ZERO_256 genesis hash constant. (~470 tok)

## packages/shared/

- `package.json` — shared package manifest with zod/runtime exports for API schemas, constants, error codes, palette, and delta types. (~160 tok)
- `tsconfig.json` — standalone strict TypeScript config for shared package compilation. (~120 tok)

## packages/shared/src/

- `index.ts` — barrel export for shared package modules. (~40 tok)

## packages/shared/src/api-schemas/

- `admin.ts` — zod schemas for admin role grants, audit log query, and secret rotation requests. (~210 tok)
- `auth.ts` — zod schemas for registration, login, password reset, me response, and profile updates. (~320 tok)
- `comment.ts` — zod schemas for comments, replies, resolve toggles, and anchor range validation. (~220 tok)
- `csp.ts` — zod schemas for legacy and Reporting API CSP report payloads. (~150 tok)
- `document.ts` — zod schemas for document summaries, create/list/patch/restore/change-owner contracts. (~270 tok)
- `envelope.ts` — common success/failure envelope zod schemas and inferred types. (~180 tok)
- `export.ts` — zod schemas for export creation/status/failure reason contracts. (~180 tok)
- `image.ts` — zod schema for image upload response, thumbnails, and supported MIME values. (~150 tok)
- `index.ts` — barrel export for all API schema domains. (~70 tok)
- `share-link.ts` — zod schemas for share-link creation with 30-day expiry validation and response token. (~170 tok)
- `suggestion.ts` — zod schemas for suggestion lifecycle, optimistic version requests, and 64KB delta validation. (~260 tok)
- `version.ts` — zod schemas for revision summary, explicit revision creation, and restore response. (~130 tok)
- `ws.ts` — zod schemas for WebSocket hello/ack/force_reload/unauthorized messages. (~180 tok)

## packages/shared/src/constants/

- `index.ts` — constants registry implementation from detailed design 20 for auth, OT, suggestions, export, image, audit, rate limits, capacity, and CI thresholds. (~820 tok)

## packages/shared/src/delta-types/

- `index.ts` — Quill Delta zod schema and inferred TypeScript types. (~170 tok)

## packages/shared/src/error-codes/

- `index.ts` — error code registry with status/chapter metadata and localized message lookup. (~1900 tok)

## packages/shared/src/palette/

- `index.ts` — fixed 16-color palette, WCAG contrast helpers, allowed-combination generation, and CSP style string helper. (~520 tok)

## tools/

- `auto_fix_docs.py` — Auto-fix documents to comply with STYLE_GUIDE.md (banned vocab + term unification + boundary spaces). (~1196 tok)
- `consensus_review.md` — Consensus Review プロトコル バージョン1.0 (~369 tok)
- `dev.mjs` — Parallel dev runner with graceful SIGINT/SIGTERM forwarding. (~901 tok)
- `lint_docs.py` — Document lint based on STYLE_GUIDE.md and QUALITY_RUBRIC.md (version 1.0). (~3505 tok)
- `migrate.mjs` — mode: fail, section, validate, psql (~773 tok)
- `seed-local.mjs` — Local psql seed script for users, roles, audit salt, and welcome document. (~420 tok)
- `traceability_check.mjs` — Docs reference and error-code registry consistency checker. (~260 tok)
