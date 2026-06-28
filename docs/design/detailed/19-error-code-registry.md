# 19エラーコード登録簿

## スコープ

全ドメイン章で発行されるエラーコードを章接頭辞付きで一元化する。各章は本ファイルへPRで自分の接頭辞のエントリを追記する。本ファイルがソースオブトゥルース。

## 名前空間規約

| 接頭辞  | 章                                                                     |
| ------- | ---------------------------------------------------------------------- |
| `AUTH-` | [03認証セッションCSRF](./03-auth-session-csrf.md)                      |
| `OT-`   | [04 OT変換規則と再接続プロトコル](./04-realtime-ot-resilience.md)      |
| `SUG-`  | [05提案モード二段CAS](./05-suggestion-two-phase-cas.md)                |
| `CMT-`  | [05bコメント追加](./05b-comments.md)                                   |
| `VER-`  | [06版作成とops圧縮](./06-version-and-ops-compaction.md)                |
| `EXP-`  | [07エクスポートパイプライン](./07-export-pipeline.md)                  |
| `IMG-`  | [08画像アップロードと自動削除キュー](./08-image-and-purge.md)          |
| `SHR-`  | [09共有リンクとゲストセッション](./09-share-link-and-guest.md)         |
| `OFF-`  | [10オフライン閲覧](./10-offline-readonly.md)                           |
| `DOC-`  | [11文書ライフサイクル](./11-document-lifecycle.md)                     |
| `CSO-`  | [12サポート運用範囲](./12-support-cs-operations.md)                    |
| `CSP-`  | [13 CSPとサニタイズ](./13-csp-and-sanitization.md)                     |
| `AUD-`  | [14監査ログとハッシュチェーン](./14-audit-log-hash-chain.md)           |
| `RL-`   | [15レートリミット](./15-rate-limit.md)                                 |
| `OPS-`  | [16バックアップ・DR・監視](./16-backup-dr-monitoring.md)               |
| `A11Y-` | [17 i18n・アクセシビリティ・カラーパレット](./17-i18n-a11y-palette.md) |
| `CI-`   | [18 CI品質ゲート](./18-ci-quality-gates.md)                            |
| `API-`  | [02 API共通契約](./02-api-contracts.md)                                |
| `ENV-`  | [21環境変数](./21-environment-variables.md)                            |
| `DIR-`  | [22ディレクトリと所有マップ](./22-directory-and-module-ownership.md)   |
| `MIG-`  | [24マイグレーション順序](./24-migrations.md)                           |

## 完全登録簿

各エントリは `code | HTTP | message_ja | message_en | 発生章` の5列で記載する。

### `AUTH-` 認証セッション

| コード     | HTTP | message_ja                             | message_en                     | 発生章 |
| ---------- | ---- | -------------------------------------- | ------------------------------ | ------ |
| `AUTH-001` | 401  | メールアドレスが見つかりません         | Email not found                | 03     |
| `AUTH-002` | 401  | パスワードが一致しません               | Password mismatch              | 03     |
| `AUTH-003` | 423  | アカウントは一時的にロックされています | Account locked                 | 03     |
| `AUTH-004` | 429  | 試行回数が上限を超えました             | Too many attempts from this IP | 03     |
| `AUTH-005` | 403  | メールアドレスの検証が完了していません | Email not verified             | 03     |
| `AUTH-006` | 500  | 認証処理に内部エラーが発生しました     | Internal authentication error  | 03     |

### `OT-` リアルタイム編集

| コード   | HTTP/Close | message_ja                         | message_en                     | 発生章 |
| -------- | ---------- | ---------------------------------- | ------------------------------ | ------ |
| `OT-001` | 4408       | サーバー側でアイドル切断されました | Server-side idle close         | 04     |
| `OT-002` | 500        | 編集状態が復元できません           | Cannot restore ack state       | 04     |
| `OT-003` | 503        | 圧縮処理中のため強制再ロードします | Force reload during compaction | 04     |

### `SUG-` 提案モード

| コード    | HTTP | message_ja                               | message_en                          | 発生章 |
| --------- | ---- | ---------------------------------------- | ----------------------------------- | ------ |
| `SUG-001` | 409  | 他者が先に提案状態を変更しました         | Suggestion state changed by another | 05     |
| `SUG-002` | 503  | 反映処理が一時的に失敗しました           | submitOp failed, please retry       | 05     |
| `SUG-003` | 409  | 本文編集により提案が追従不能になりました | Suggestion stale due to base edits  | 05     |
| `SUG-004` | 413  | 提案サイズが上限を超えました             | Suggestion delta exceeds 64KB       | 05     |
| `SUG-005` | 410  | 提案は既に失効しています                 | Suggestion expired                  | 05     |

### `CMT-` コメント

| コード    | HTTP | message_ja                       | message_en                         | 発生章 |
| --------- | ---- | -------------------------------- | ---------------------------------- | ------ |
| `CMT-001` | 403  | 閲覧者はコメントできません       | Viewer cannot comment              | 05b    |
| `CMT-002` | 400  | アンカー範囲が不正です           | Invalid anchor range               | 05b    |
| `CMT-003` | 410  | 削除済み文書にコメントできません | Cannot comment on deleted document | 05b    |

### `VER-` 版とops圧縮

| コード    | HTTP | message_ja                             | message_en                        | 発生章 |
| --------- | ---- | -------------------------------------- | --------------------------------- | ------ |
| `VER-001` | 410  | 圧縮済み区間の中間状態は再現できません | Compacted interval not restorable | 06     |
| `VER-002` | 503  | 圧縮処理中です                         | Compaction in progress            | 06     |
| `VER-003` | 500  | 不変条件違反のため復元を中止しました   | Reachability violation detected   | 06     |
| `VER-004` | 409  | 復元のリトライ上限に達しました         | Restore retries exhausted         | 06     |

### `EXP-` エクスポート

| コード    | HTTP | message_ja                               | message_en                 | 発生章 |
| --------- | ---- | ---------------------------------------- | -------------------------- | ------ |
| `EXP-001` | 429  | 同時実行の上限を超えました               | Per-user concurrency limit | 07     |
| `EXP-002` | 500  | レンダリングに失敗しました               | Render error               | 07     |
| `EXP-003` | 500  | メモリ不足が発生しました                 | Memory exhausted           | 07     |
| `EXP-004` | 503  | ストレージが利用できません               | Storage unavailable        | 07     |
| `EXP-005` | 408  | 生成がタイムアウトしました               | Generation timeout         | 07     |
| `EXP-006` | 200  | キャンセルされました(成功応答内のreason) | Cancelled by user          | 07     |

### `IMG-` 画像

| コード    | HTTP | message_ja                    | message_en                    | 発生章 |
| --------- | ---- | ----------------------------- | ----------------------------- | ------ |
| `IMG-001` | 413  | 画像サイズが10MiBを超えました | Image size exceeds 10MiB      | 08     |
| `IMG-002` | 415  | 対応していない画像形式です    | Unsupported MIME              | 08     |
| `IMG-003` | 400  | ファイル形式が一致しません    | MIME and magic bytes mismatch | 08     |
| `IMG-004` | 503  | ストレージが利用できません    | Storage unavailable           | 08     |
| `IMG-005` | 500  | サムネイル生成に失敗しました  | Thumbnail generation failed   | 08     |

### `SHR-` 共有リンク

| コード    | HTTP/Close | message_ja                           | message_en                     | 発生章 |
| --------- | ---------- | ------------------------------------ | ------------------------------ | ------ |
| `SHR-001` | 410        | 共有リンクは失効しています           | Share link revoked or expired  | 09     |
| `SHR-002` | 400        | 編集権限の共有リンクは発行できません | Editor share link not allowed  | 09     |
| `SHR-003` | 400        | 有効期限は30日以内に設定してください | Expires must be within 30 days | 09     |
| `SHR-004` | 401        | ゲストWSトークンが無効です           | Invalid guest WS token         | 09     |
| `SHR-005` | 4410       | 共有リンクが失効しました             | Share link revoked             | 09     |

### `OFF-` オフライン閲覧

| コード    | HTTP | message_ja           | message_en                    | 発生章 |
| --------- | ---- | -------------------- | ----------------------------- | ------ |
| `OFF-001` | 403  | 権限が剥奪されました | Permission revoked            | 10     |
| `OFF-002` | 410  | 文書が削除されました | Document deleted              | 10     |
| `OFF-003` | 0    | キャッシュ上限超過   | Cache eviction (client local) | 10     |

### `DOC-` 文書ライフサイクル

| コード    | HTTP | message_ja                 | message_en             | 発生章 |
| --------- | ---- | -------------------------- | ---------------------- | ------ |
| `DOC-001` | 403  | 所有者以外は変更できません | Owner only             | 11     |
| `DOC-002` | 410  | 復元期限を過ぎています     | Restore window expired | 11     |
| `DOC-003` | 409  | 既に削除済みです           | Already deleted        | 11     |
| `DOC-004` | 400  | カーソル形式が不正です     | Invalid cursor format  | 11     |

### `CSO-` サポート運用

| コード    | HTTP | message_ja                           | message_en                 | 発生章 |
| --------- | ---- | ------------------------------------ | -------------------------- | ------ |
| `CSO-001` | 403  | 必要なロールを保持していません       | Required role not granted  | 12     |
| `CSO-002` | 400  | 必須クエリパラメータが不足しています | Required query missing     | 12     |
| `CSO-003` | 400  | 問い合わせIDが必須です               | support_ticket_id required | 12     |
| `CSO-004` | 409  | 同一ロールの重複付与です             | Role already granted       | 12     |

### `CSP-` CSPとサニタイズ

| コード    | HTTP | message_ja                             | message_en                   | 発生章 |
| --------- | ---- | -------------------------------------- | ---------------------------- | ------ |
| `CSP-001` | 400  | Originヘッダが不正です                 | Invalid Origin               | 13     |
| `CSP-002` | 429  | CSPレポートの上限超過です              | CSP report rate exceeded     | 13     |
| `CSP-003` | 413  | CSPレポートが大きすぎます              | CSP report payload too large | 13     |
| `CSP-004` | 400  | 入力に許可されない要素が含まれています | Sanitizer rejected input     | 13     |

### `AUD-` 監査ログ

| コード    | HTTP | message_ja                         | message_en             | 発生章 |
| --------- | ---- | ---------------------------------- | ---------------------- | ------ |
| `AUD-001` | 500  | 監査ログのチェーンが破損しています | Audit chain corruption | 14     |
| `AUD-002` | 500  | salt_versionが見つかりません       | salt_version not found | 14     |
| `AUD-003` | 503  | advisory lockを取得できません      | Advisory lock timeout  | 14     |

### `RL-` レートリミット

| コード   | HTTP/Close | message_ja                               | message_en                | 発生章 |
| -------- | ---------- | ---------------------------------------- | ------------------------- | ------ |
| `RL-001` | 429        | ログイン試行制限を超えました             | Login rate limit          | 15     |
| `RL-002` | 429        | パスワードリセット要求の上限を超えました | Password reset rate limit | 15     |
| `RL-003` | 429        | エクスポート同時実行の上限を超えました   | Export concurrency limit  | 15     |
| `RL-004` | 429        | 画像アップロードの上限を超えました       | Image upload window       | 15     |
| `RL-005` | 429        | APIリクエスト上限を超えました            | API rate limit            | 15     |
| `RL-006` | 4429       | WebSocket送信上限です                    | WS submit limit           | 15     |

### `OPS-` 運用とアラート

| コード    | 重大度   | message_ja                  | message_en         | 発生章 |
| --------- | -------- | --------------------------- | ------------------ | ------ |
| `OPS-001` | Critical | バックアップに失敗しました  | Backup job failed  | 16     |
| `OPS-002` | Critical | WALアーカイブに失敗しました | WAL archive failed | 16     |
| `OPS-003` | Warning  | ログ転送が遅延しています    | Loki ingest delay  | 16     |

### `A11Y-` アクセシビリティ

| コード     | HTTP | message_ja                     | message_en                  | 発生章 |
| ---------- | ---- | ------------------------------ | --------------------------- | ------ |
| `A11Y-001` | 400  | 規定外の色を指定しています     | Color outside fixed palette | 17     |
| `A11Y-002` | 400  | コントラスト比が不足しています | Insufficient contrast ratio | 17     |

### `CI-` 品質ゲート

| コード   | CIステータス | message_ja                                             | message_en                                 | 発生章 |
| -------- | ------------ | ------------------------------------------------------ | ------------------------------------------ | ------ |
| `CI-001` | failure      | gitleaksが秘密情報を検出しました                       | gitleaks found secrets                     | 18     |
| `CI-002` | failure      | マイグレーションSQLに構文エラー                        | Migration SQL syntax error                 | 18     |
| `CI-003` | failure      | カバレッジ閾値未達                                     | Coverage below threshold                   | 18     |
| `CI-004` | failure      | E2E主要導線が失敗しました                              | E2E critical journey failed                | 18     |
| `CI-005` | warning      | quarantineラベル付テストが残存                         | Quarantined tests remain                   | 18     |
| `CI-006` | failure      | 依存にHigh以上のCVEがあります(OWASP A06)               | Dependency has High+ CVE (OWASP A06)       | 18     |
| `CI-007` | failure      | OWASP TOP 10違反をSemgrepが検出しました                | OWASP TOP 10 violation detected by Semgrep | 18     |
| `CI-008` | failure      | コンテナ/ファイルシステムに脆弱性を検出しました(Trivy) | Vulnerability detected by Trivy            | 18     |
| `CI-009` | failure      | OWASP ZAP Baselineスキャンが失敗しました               | OWASP ZAP Baseline scan failed             | 18     |

### `API-` 共通

| コード    | HTTP | message_ja               | message_en             | 発生章 |
| --------- | ---- | ------------------------ | ---------------------- | ------ |
| `API-001` | 400  | CSRFトークンが無効です   | Invalid CSRF token     | 02     |
| `API-002` | 400  | リクエスト形式が不正です | Invalid request format | 02     |
| `API-500` | 500  | 内部エラーが発生しました | Internal server error  | 27     |

### `ENV-` 環境変数

| コード    | 起動失敗 | message_ja                                 | message_en                     | 発生章 |
| --------- | -------- | ------------------------------------------ | ------------------------------ | ------ |
| `ENV-001` | exit 1   | 必須環境変数が欠落しています               | Required env missing           | 21     |
| `ENV-002` | exit 1   | `AUDIT_HASH_SALT_v{N}` が欠落しています    | `AUDIT_HASH_SALT_v{N}` missing | 21     |
| `ENV-003` | exit 1   | 秘密鍵の長さが不足しています(32バイト未満) | Secret key too short           | 21     |

### `DIR-` ディレクトリ規約

| コード    | CIステータス | message_ja             | message_en                  | 発生章 |
| --------- | ------------ | ---------------------- | --------------------------- | ------ |
| `DIR-001` | failure      | ESLint境界規則違反です | ESLint boundaries violation | 22     |

### `MIG-` マイグレーション

| コード    | CIステータス | message_ja                                 | message_en                          | 発生章 |
| --------- | ------------ | ------------------------------------------ | ----------------------------------- | ------ |
| `MIG-001` | failure      | マイグレーションSQL構文エラー              | Migration SQL syntax error          | 24     |
| `MIG-002` | failure      | ファイル名タイムスタンプの昇順違反         | Migration filename ordering invalid | 24     |
| `MIG-003` | failure      | downがupを逆転できません                   | down does not reverse up            | 24     |
| `MIG-004` | failure      | audit_logsマイグレーションが欠落しています | audit_logs migration missing        | 24     |

## 規約

- 新規エラーコードは章接頭辞+連番3桁。例: `SUG-006`。
- 既存コードの削除は禁止(下位互換)。
- `message_ja` と `message_en` は両方必須。
- PRには対応するテストID(`T-<prefix>-NNN`)を必ず添える。

## トレーサビリティ

| 対応要件                     | 対応基本設計節 | 対応ADR    |
| ---------------------------- | -------------- | ---------- |
| (全章のエラー応答契約の集約) | (該当なし)     | (該当なし) |
