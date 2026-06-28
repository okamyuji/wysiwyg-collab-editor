# 20定数登録簿

## スコープ

全章で参照される定数を一元化する。各ドメイン章は本ファイルへPRで自分の定数を追記する。本ファイルがソースオブトゥルース。

## 命名規約

- 大文字SNAKE_CASE
- 単位を末尾に含める(`_SECONDS`、`_BYTES`、`_KIBIBYTES`、`_COUNT`、`_RATIO`)
- グループは接頭辞でまとめる(`AUTH_`、`SUG_`、`EXP_`、`IMG_`、`CSP_`、`AUD_`、`OT_`、`RL_`、`OPS_`、`A11Y_`、`OFF_`)

## 認証(03)

| キー                                  | 値      | 単位       | 出所             |
| ------------------------------------- | ------- | ---------- | ---------------- |
| `AUTH_ARGON2ID_MEMORY_KIBIBYTES`      | 19456   | KiB(19MiB) | OWASP推奨        |
| `AUTH_ARGON2ID_ITERATIONS`            | 2       | 回         | OWASP推奨        |
| `AUTH_ARGON2ID_PARALLELISM`           | 1       | 並列度     | OWASP推奨        |
| `AUTH_ARGON2ID_OUTPUT_BYTES`          | 32      | バイト     | OWASP推奨        |
| `AUTH_ARGON2ID_SALT_BYTES`            | 16      | バイト     | OWASP推奨        |
| `AUTH_PASSWORD_MIN_LENGTH`            | 12      | 文字       | NFR-04           |
| `AUTH_LOGIN_FAIL_USER_WINDOW_SECONDS` | 600     | 秒(10分)   | NFR-04           |
| `AUTH_LOGIN_FAIL_USER_THRESHOLD`      | 5       | 回         | NFR-04           |
| `AUTH_LOGIN_BLOCK_USER_SECONDS`       | 600     | 秒(10分)   | NFR-04           |
| `AUTH_LOGIN_FAIL_IP_WINDOW_SECONDS`   | 900     | 秒(15分)   | NFR-04           |
| `AUTH_LOGIN_FAIL_IP_THRESHOLD`        | 20      | 回         | NFR-04           |
| `AUTH_LOGIN_BLOCK_IP_SECONDS`         | 1800    | 秒(30分)   | NFR-04           |
| `AUTH_SESSION_TTL_SECONDS`            | 1209600 | 秒(14日)   | ADR-0006         |
| `AUTH_PWRESET_TTL_SECONDS`            | 3600    | 秒(1時間)  | NFR-04           |
| `AUTH_EMAIL_VERIFY_TTL_SECONDS`       | 3600    | 秒(1時間)  | NFR-04           |
| `AUTH_GUEST_WS_TOKEN_TTL_SECONDS`     | 900     | 秒(15分)   | ADR-0006、NFR-04 |

## OT(04)

| キー                             | 値     | 単位    | 出所   |
| -------------------------------- | ------ | ------- | ------ |
| `OT_ACK_REDIS_TTL_SECONDS`       | 604800 | 秒(7日) | §5.3   |
| `OT_ACK_SNAPSHOT_RETAIN_DAYS`    | 30     | 日      | §3.2   |
| `OT_RECONNECT_INITIAL_SECONDS`   | 1      | 秒      | §5.3.1 |
| `OT_RECONNECT_MAX_SECONDS`       | 30     | 秒      | §5.3.1 |
| `OT_RECONNECT_MAX_ATTEMPTS`      | 10     | 回      | §5.3.1 |
| `OT_RESEND_FRAME_SIZE`           | 100    | ops     | §5.3.1 |
| `OT_APPLY_BUFFER_LIMIT`          | 1000   | ops     | §5.3.1 |
| `OT_SERVER_IDLE_TIMEOUT_SECONDS` | 95     | 秒      | §4.3   |

## 提案(05)

| キー                         | 値    | 単位         | 出所     |
| ---------------------------- | ----- | ------------ | -------- |
| `SUG_BATCH_INTERVAL_SECONDS` | 600   | 秒(10分)     | §5.6     |
| `SUG_BATCH_PER_DOC_LIMIT`    | 100   | 件           | §5.6     |
| `SUG_DELTA_MAX_BYTES`        | 65536 | バイト(64KB) | ADR-0011 |
| `SUG_IDLE_GROUPING_SECONDS`  | 5     | 秒           | FR-05    |

## 版(06)

| キー                           | 値   | 単位      | 出所    |
| ------------------------------ | ---- | --------- | ------- |
| `VER_AUTO_THRESHOLD_OPS`       | 100  | 操作      | 要件8章 |
| `VER_AUTO_INTERVAL_SECONDS`    | 3600 | 秒(1時間) | 要件8章 |
| `VER_AUTO_MAX_COUNT`           | 1000 | 件        | 要件8章 |
| `VER_ARCHIVED_OPS_GRACE_HOURS` | 72   | 時間      | §5.7.1  |
| `VER_RESTORE_RETRY_MAX`        | 3    | 回        | §5.7    |

## エクスポート(07)

| キー                              | 値  | 単位 | 出所  |
| --------------------------------- | --- | ---- | ----- |
| `EXP_JOB_TIMEOUT_SECONDS`         | 60  | 秒   | §5.10 |
| `EXP_HEARTBEAT_INTERVAL_SECONDS`  | 20  | 秒   | §5.10 |
| `EXP_HEARTBEAT_STALL_SECONDS`     | 60  | 秒   | §5.10 |
| `EXP_REAPER_INTERVAL_SECONDS`     | 30  | 秒   | §5.10 |
| `EXP_REAPER_BACKOFF_BASE_SECONDS` | 60  | 秒   | §5.10 |
| `EXP_REAPER_BACKOFF_MAX_SECONDS`  | 600 | 秒   | §5.10 |
| `EXP_MAX_ATTEMPT`                 | 3   | 回   | §5.10 |
| `EXP_PROC_CONCURRENCY`            | 2   | 件   | §5.10 |
| `EXP_USER_CONCURRENCY`            | 2   | 件   | §5.10 |
| `EXP_DOC_CONCURRENCY`             | 1   | 件   | §5.10 |
| `EXP_POLL_MIN_SECONDS`            | 2   | 秒   | §5.10 |
| `EXP_POLL_MAX_SECONDS`            | 30  | 秒   | §5.10 |
| `EXP_SIGNED_URL_TTL_HOURS`        | 24  | 時間 | §5.10 |
| `EXP_JOB_EXPIRE_DAYS`             | 7   | 日   | §3.2  |
| `EXP_CTE_CANDIDATE_LIMIT`         | 16  | 件   | §5.10 |

## 画像(08)

| キー                             | 値               | 単位          | 出所    |
| -------------------------------- | ---------------- | ------------- | ------- |
| `IMG_MAX_BYTES`                  | 10485760         | バイト(10MiB) | §5.8    |
| `IMG_THUMB_SIZES`                | [1280, 640, 320] | px            | 要件8章 |
| `IMG_PURGE_DELAY_HOURS`          | 48               | 時間          | §3.2    |
| `IMG_PURGE_BACKOFF_BASE_SECONDS` | 60               | 秒            | §3.2    |
| `IMG_PURGE_BACKOFF_MAX_HOURS`    | 24               | 時間          | §3.2    |
| `IMG_PURGE_MAX_ATTEMPT`          | 5                | 回            | §3.2    |
| `IMG_PURGE_BATCH_LIMIT`          | 100              | 行            | 本章    |

## 共有リンク(09)

| キー                             | 値  | 単位                     | 出所                                  |
| -------------------------------- | --- | ------------------------ | ------------------------------------- |
| `SHR_TOKEN_BYTES`                | 32  | バイト(base64url 43文字) | §5.9                                  |
| `SHR_EXPIRES_MAX_DAYS`           | 30  | 日                       | §5.9                                  |
| `SHR_GUEST_WS_TOKEN_TTL_SECONDS` | 900 | 秒(15分)                 | AUTH_GUEST_WS_TOKEN_TTL_SECONDSと同値 |

## オフライン(10)

| キー                      | 値  | 単位 | 出所     |
| ------------------------- | --- | ---- | -------- |
| `OFF_CACHE_MAX_DOCS`      | 5   | 件   | ADR-0012 |
| `OFF_CACHE_MAX_IMAGES`    | 50  | 枚   | ADR-0012 |
| `OFF_CACHE_MAX_UI_SHELLS` | 1   | 件   | ADR-0012 |

## 文書ライフサイクル(11)

| キー                    | 値             | 単位 | 出所  |
| ----------------------- | -------------- | ---- | ----- |
| `DOC_DELETE_GRACE_DAYS` | 30             | 日   | FR-12 |
| `DOC_LIST_PAGE_SIZE`    | 50             | 件   | FR-12 |
| `DOC_PURGE_CRON`        | "0 2 \* \* \*" | cron | §5.12 |
| `DOC_IMAGE_PURGE_CRON`  | "0 3 \* \* \*" | cron | §5.12 |

## 監査ログ(14)

| キー                            | 値             | 単位   | 出所     |
| ------------------------------- | -------------- | ------ | -------- |
| `AUD_RETENTION_DAYS`            | 365            | 日     | NFR-05   |
| `AUD_VERIFY_BATCH_CRON`         | "0 0 \* \* \*" | cron   | ADR-0018 |
| `AUD_SALT_ROTATION_QUARTERS`    | 1              | 四半期 | ADR-0018 |
| `AUD_SALT_GRACE_DAYS`           | 30             | 日     | ADR-0018 |
| `AUD_ADVISORY_LOCK_KEY`         | 0x4155444954   | bigint | §10.1    |
| `AUD_PARALLEL_HOLD_GENERATIONS` | 4              | 世代   | ADR-0018 |

## レートリミット(15)

| キー                              | 値   | 単位         | 出所 |
| --------------------------------- | ---- | ------------ | ---- |
| `RL_CSP_REPORT_WINDOW_SECONDS`    | 60   | 秒           | §4.1 |
| `RL_CSP_REPORT_MAX`               | 10   | 件           | §4.1 |
| `RL_CSP_REPORT_PAYLOAD_MAX_BYTES` | 8192 | バイト(8KiB) | §4.1 |
| `RL_API_GLOBAL_WINDOW_SECONDS`    | 60   | 秒           | 本章 |
| `RL_API_GLOBAL_MAX`               | 600  | 件           | 本章 |
| `RL_IMAGE_WINDOW_SECONDS`         | 60   | 秒           | 本章 |
| `RL_IMAGE_MAX`                    | 20   | 件           | 本章 |

## DR(16)

| キー                              | 値             | 単位           | 出所     |
| --------------------------------- | -------------- | -------------- | -------- |
| `OPS_RTO_HOURS`                   | 4              | 時間           | ADR-0020 |
| `OPS_RPO_MINUTES`                 | 5              | 分             | ADR-0020 |
| `OPS_BACKUP_PHYSICAL_CRON`        | "0 2 \* \* \*" | cron           | 本章     |
| `OPS_BACKUP_LOGICAL_CRON`         | "0 2 \* \* 6"  | cron           | 本章     |
| `OPS_BACKUP_RETAIN_DAYS_PHYSICAL` | 30             | 日             | 本章     |
| `OPS_BACKUP_RETAIN_WEEKS_LOGICAL` | 12             | 週             | 本章     |
| `OPS_LOG_RETAIN_DAYS_APP`         | 30             | 日             | §10      |
| `OPS_LOG_BUFFER_BYTES`            | 536870912      | バイト(512MiB) | §10      |

## 容量(NFR-01)

| キー                    | 値   | 単位 | 出所   |
| ----------------------- | ---- | ---- | ------ |
| `CAP_DOC_SUBSCRIBE_MAX` | 30   | 名   | NFR-01 |
| `CAP_WS_CONNECTION_MAX` | 5000 | 接続 | NFR-01 |

## CIゲート(18)

| キー                     | 値  | 単位       | 出所     |
| ------------------------ | --- | ---------- | -------- |
| `CI_COVERAGE_STATEMENTS` | 80  | パーセント | ADR-0009 |
| `CI_COVERAGE_BRANCHES`   | 70  | パーセント | ADR-0009 |
| `CI_COVERAGE_FUNCTIONS`  | 80  | パーセント | ADR-0009 |
| `CI_COVERAGE_LINES`      | 80  | パーセント | ADR-0009 |
| `CI_E2E_RETRIES`         | 1   | 回         | ADR-0009 |

## ランタイムとツールのバージョン(2026-06-28時点の最新stable採用)

確定値の出所はnpm registryまたはGitHub releases API(2026-06-28取得)。アップグレード時は本表を更新し、CIゲートを通過させる。

| キー                         | 値     | 区分               | 出所                                                                            |
| ---------------------------- | ------ | ------------------ | ------------------------------------------------------------------------------- |
| `RUNTIME_NODE_VERSION`       | 24     | Node.js Active LTS | nodejs.org Release Schedule(LTSは10月にNode.js 26へ移行予定、移行は別ADRで起票) |
| `RUNTIME_POSTGRES_VERSION`   | 18.4   | major.minor        | endoflife.date PostgreSQL                                                       |
| `RUNTIME_REDIS_VERSION`      | 8.8.0  | major.minor.patch  | redis/redis releases                                                            |
| `RUNTIME_PNPM_VERSION`       | 11.9.0 | major.minor.patch  | pnpm/pnpm releases                                                              |
| `RUNTIME_TYPESCRIPT_VERSION` | 6.0.3  | major.minor.patch  | microsoft/TypeScript releases                                                   |
| `RUNTIME_VITE_PLUS_VERSION`  | 0.2.1  | major.minor.patch  | voidzero-dev/vite-plus releases                                                 |
| `RUNTIME_VITEST_VERSION`     | 4.1.9  | major.minor.patch  | vitest-dev/vitest releases(Vite+が内部固定)                                     |
| `RUNTIME_PLAYWRIGHT_VERSION` | 1.61.1 | major.minor.patch  | microsoft/playwright releases                                                   |

## アプリ層ライブラリのバージョン(2026-06-28時点)

| キー                               | パッケージ           | 値     |
| ---------------------------------- | -------------------- | ------ |
| `LIB_EXPRESS_VERSION`              | express              | 5.2.1  |
| `LIB_EXPRESS_SESSION_VERSION`      | express-session      | 1.19.0 |
| `LIB_CONNECT_REDIS_VERSION`        | connect-redis        | 9.0.0  |
| `LIB_CSRF_CSRF_VERSION`            | csrf-csrf            | 4.0.3  |
| `LIB_HELMET_VERSION`               | helmet               | 8.2.0  |
| `LIB_ARGON2_VERSION`               | Argon2id             | 0.44.0 |
| `LIB_EXPRESS_RATE_LIMIT_VERSION`   | express-rate-limit   | 8.5.2  |
| `LIB_RATE_LIMIT_REDIS_VERSION`     | rate-limit-redis     | 5.0.0  |
| `LIB_SHAREDB_VERSION`              | ShareDB              | 6.0.0  |
| `LIB_SHAREDB_POSTGRES_VERSION`     | sharedb-postgres     | 6.0.0  |
| `LIB_QUILL_VERSION`                | quill                | 2.0.3  |
| `LIB_QUILL_BETTER_TABLE_VERSION`   | quill-better-table   | 1.2.10 |
| `LIB_SHARP_VERSION`                | sharp                | 0.35.2 |
| `LIB_DOMPURIFY_VERSION`            | dompurify            | 3.4.11 |
| `LIB_ISOMORPHIC_DOMPURIFY_VERSION` | isomorphic-dompurify | 3.18.0 |
| `LIB_PINO_VERSION`                 | pino                 | 10.3.1 |
| `LIB_PROM_CLIENT_VERSION`          | prom-client          | 15.1.3 |
| `LIB_NODE_PG_MIGRATE_VERSION`      | node-pg-migrate      | 8.0.4  |
| `LIB_DOCX_VERSION`                 | docx                 | 9.7.1  |
| `LIB_UNIFIED_VERSION`              | unified              | 11.0.5 |
| `LIB_WORKBOX_VERSION`              | workbox              | 7.4.1  |
| `LIB_I18NEXT_VERSION`              | i18next              | 26.3.3 |
| `LIB_ZOD_VERSION`                  | zod                  | 4.4.3  |
| `LIB_CANONICALIZE_VERSION`         | canonicalize         | 3.0.0  |

## セキュリティスキャナのバージョン(2026-06-28時点、CIゲート用)

| キー                   | パッケージ | 値                           |
| ---------------------- | ---------- | ---------------------------- |
| `SEC_GITLEAKS_VERSION` | gitleaks   | 8.30.1                       |
| `SEC_SEMGREP_VERSION`  | semgrep    | 1.168.0                      |
| `SEC_TRIVY_VERSION`    | trivy      | 0.71.2                       |
| `SEC_ZAP_VERSION`      | zaproxy    | 2.17.0                       |
| `SEC_MINIO_VERSION`    | minio      | RELEASE.2025-10-15T17-29-55Z |

## バージョン更新ポリシー

- 確定値は2026-06-28時点の最新stableである。CI開始までに本表を直近のnpm registry/GitHub releasesと再突合し、差分があれば本表とロックファイルを同時更新する。
- セキュリティパッチを含むpatch更新は無条件で許可(本表更新は不要)。
- minor更新は本表更新+CIの全ゲートpassで許可。
- major更新は差し替えADRを起票して本表を更新する。
- `pnpm audit`(SCA、18章)でHigh以上のCVEが当該バージョンで検出された場合は即時patch/minor上げ、不可能ならmajor上げの差し替えADRを優先する。

## トレーサビリティ

| 対応要件               | 対応基本設計節 | 対応ADR    |
| ---------------------- | -------------- | ---------- |
| (全章の数値定数の集約) | (該当なし)     | (該当なし) |
