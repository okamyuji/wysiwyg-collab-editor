# トレーサビリティ行列

要件↔基本設計↔詳細設計↔テストID↔CIゲートを縦横で逆引きする。実装着手判定の根拠となる。

## 機能要件(FR)

| FR                      | 要件節     | 基本設計節         | 詳細設計                                                                                               | 主テストID      | CIゲート           |
| ----------------------- | ---------- | ------------------ | ------------------------------------------------------------------------------------------------------ | --------------- | ------------------ |
| FR-01リアルタイム編集   | spec §3.1  | §5.3、§5.3.1、§5.4 | [04 OT変換規則と再接続プロトコル](../design/detailed/04-realtime-ot-resilience.md)                     | T-OT-001〜005   | Vitest、Playwright |
| FR-02文字色背景色       | spec §3.2  | §3.4a              | [17 i18n a11y palette](../design/detailed/17-i18n-a11y-palette.md)                                     | T-A11Y-001〜003 | Vitest、Playwright |
| FR-03コメント           | spec §3.3  | §5.5               | [05bコメント追加](../design/detailed/05b-comments.md)                                                  | T-CMT-001〜003  | Vitest、Playwright |
| FR-04共有リンク         | spec §3.4  | §5.9               | [09共有リンクとゲストセッション](../design/detailed/09-share-link-and-guest.md)                        | T-SHR-001〜006  | Vitest、Playwright |
| FR-05提案モード         | spec §3.5  | §5.6               | [05提案モード二段CAS](../design/detailed/05-suggestion-two-phase-cas.md)                               | T-SUG-001〜008  | Vitest、Playwright |
| FR-06版履歴             | spec §3.6  | §5.7、§5.7.1       | [06版作成とops圧縮](../design/detailed/06-version-and-ops-compaction.md)                               | T-VER-001〜005  | Vitest、Playwright |
| FR-07エクスポート       | spec §3.7  | §5.10              | [07エクスポートパイプライン](../design/detailed/07-export-pipeline.md)                                 | T-EXP-001〜008  | Vitest、Playwright |
| FR-08認証               | spec §3.8  | §5.1、§6.1、§6.2   | [03認証セッションCSRF](../design/detailed/03-auth-session-csrf.md)                                     | T-AUTH-001〜008 | Vitest、Playwright |
| FR-09オフライン閲覧     | spec §3.9  | §5.11              | [10オフライン閲覧](../design/detailed/10-offline-readonly.md)                                          | T-OFF-001〜005  | Vitest、Playwright |
| FR-10ライブラリ選定方針 | spec §3.10 | §12                | (基本設計に集約、詳細章は[18 CI品質ゲート](../design/detailed/18-ci-quality-gates.md)の依存固定で補完) | T-CI-001〜005   | Vitest             |
| FR-11画像アップロード   | spec §3.11 | §5.8               | [08画像アップロードと自動削除キュー](../design/detailed/08-image-and-purge.md)                         | T-IMG-001〜007  | Vitest、Playwright |
| FR-12文書管理           | spec §3.12 | §5.12              | [11文書ライフサイクル](../design/detailed/11-document-lifecycle.md)                                    | T-DOC-001〜006  | Vitest、Playwright |
| FR-13サポート運用       | spec §3.13 | §5.13              | [12サポート運用範囲](../design/detailed/12-support-cs-operations.md)                                   | T-CSO-001〜006  | Vitest、Playwright |

## 非機能要件(NFR)

| NFR                    | 要件節      | 基本設計節 | 詳細設計                                                                                                                                                                                                                                                            | 主テストID                                                    | CIゲート                                      |
| ---------------------- | ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| NFR-01容量上限         | spec NFR-01 | §3.4b      | [11文書ライフサイクル](../design/detailed/11-document-lifecycle.md)、[15レートリミット](../design/detailed/15-rate-limit.md)                                                                                                                                        | T-DOC-005、T-RL-001〜004                                      | Vitest                                        |
| NFR-02ブラウザ対応     | spec NFR-02 | §1.2       | (詳細章 横断、各e2eで担保)                                                                                                                                                                                                                                          | T-A11Y-005、T-AUTH-008                                        | Playwright                                    |
| NFR-03ACK応答性        | spec NFR-03 | §5.3       | [04 OT変換規則と再接続プロトコル](../design/detailed/04-realtime-ot-resilience.md)                                                                                                                                                                                  | T-OT-001〜005                                                 | Vitest                                        |
| NFR-04セキュリティ     | spec NFR-04 | §6、§7     | [03 auth](../design/detailed/03-auth-session-csrf.md)、[13 CSPサニタイズ](../design/detailed/13-csp-and-sanitization.md)、[15レートリミット](../design/detailed/15-rate-limit.md)、[18 CI品質ゲートOWASP TOP 10フェーズ](../design/detailed/18-ci-quality-gates.md) | T-AUTH-001〜008、T-CSP-001〜006、T-RL-001〜004、T-CI-006〜010 | Vitest、Playwright、Semgrep、Trivy、OWASP ZAP |
| NFR-05監査ログ         | spec NFR-05 | §10.1      | [14監査ログとハッシュチェーン](../design/detailed/14-audit-log-hash-chain.md)                                                                                                                                                                                       | T-AUD-001〜006                                                | Vitest                                        |
| NFR-06可用性           | spec NFR-06 | §10        | [16バックアップDR監視](../design/detailed/16-backup-dr-monitoring.md)                                                                                                                                                                                               | T-OPS-001〜003                                                | meta                                          |
| NFR-07運用             | spec NFR-07 | §10、§9    | [16バックアップDR監視](../design/detailed/16-backup-dr-monitoring.md)                                                                                                                                                                                               | T-OPS-001〜003                                                | meta                                          |
| NFR-08アクセシビリティ | spec NFR-08 | §3.4a      | [17 i18n a11y palette](../design/detailed/17-i18n-a11y-palette.md)                                                                                                                                                                                                  | T-A11Y-001〜006                                               | Vitest、Playwright                            |
| NFR-09キャッシュ       | spec NFR-09 | §5.11      | [10オフライン閲覧](../design/detailed/10-offline-readonly.md)                                                                                                                                                                                                       | T-OFF-001〜005                                                | Vitest、Playwright                            |
| NFR-10品質ゲート       | spec NFR-10 | §11        | [18 CI品質ゲート](../design/detailed/18-ci-quality-gates.md)                                                                                                                                                                                                        | T-CI-001〜005                                                 | (CI自体)                                      |

## 章間連携(ドメイン層の互いに素規約)

ドメイン層各章は他章のテーブルへ直接アクセスせず、以下のイベントで連携する。

| 発火元                                                                               | イベント                   | 受信側                                                                             | 経路                |
| ------------------------------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| [11文書ライフサイクル](../design/detailed/11-document-lifecycle.md) `document_purge` | `image_purge_queue` INSERT | [08画像アップロードと自動削除キュー](../design/detailed/08-image-and-purge.md)     | DBキュー            |
| [11文書ライフサイクル](../design/detailed/11-document-lifecycle.md)論理削除          | `force_reload`             | [04 OT変換規則と再接続プロトコル](../design/detailed/04-realtime-ot-resilience.md) | WebSocket           |
| [06版作成とops圧縮](../design/detailed/06-version-and-ops-compaction.md)圧縮         | `force_reload`             | [04 OT変換規則と再接続プロトコル](../design/detailed/04-realtime-ot-resilience.md) | WebSocket           |
| 全章                                                                                 | 業務イベント               | [14監査ログとハッシュチェーン](../design/detailed/14-audit-log-hash-chain.md)      | `audit_logs` INSERT |
| [09共有リンクとゲストセッション](../design/detailed/09-share-link-and-guest.md)失効  | Close 4410                 | [10オフライン閲覧](../design/detailed/10-offline-readonly.md)                      | WebSocket           |
| [13 CSPとサニタイズ](../design/detailed/13-csp-and-sanitization.md)違反受信          | `csp_violation`            | [14監査ログとハッシュチェーン](../design/detailed/14-audit-log-hash-chain.md)      | アプリ層集約        |

## 基盤層(全章が参照)

| 章                                                                            | 提供契約                                        | 主な利用章 |
| ----------------------------------------------------------------------------- | ----------------------------------------------- | ---------- |
| [03認証セッションCSRF](../design/detailed/03-auth-session-csrf.md)            | セッション/CSRF/Argon2id/WSサブプロトコル       | 全章       |
| [14監査ログとハッシュチェーン](../design/detailed/14-audit-log-hash-chain.md) | `audit_logs` INSERT契約、`secret_versions` 管理 | 全章       |
| [19エラーコード登録簿](../design/detailed/19-error-code-registry.md)          | 章接頭辞付きエラーコード                        | 全章       |
| [20定数登録簿](../design/detailed/20-constants-registry.md)                   | 全定数の一元化                                  | 全章       |

## 横断層(基盤層のみに依存)

| 章                                                                    | 提供契約                                   | 主な利用章  |
| --------------------------------------------------------------------- | ------------------------------------------ | ----------- |
| [02 API共通契約](../design/detailed/02-api-contracts.md)              | エンベロープ/カーソルページング/エラー応答 | 全REST章    |
| [13 CSPとサニタイズ](../design/detailed/13-csp-and-sanitization.md)   | CSPヘッダ/サニタイザ                       | 全表示章    |
| [15レートリミット](../design/detailed/15-rate-limit.md)               | レート制限規則                             | 全REST/WS章 |
| [16バックアップDR監視](../design/detailed/16-backup-dr-monitoring.md) | バックアップ/DR/Prometheus/アラート        | 全章        |
| [17 i18n a11y palette](../design/detailed/17-i18n-a11y-palette.md)    | 言語/a11y/16色パレット                     | 全UI章      |
| [18 CI品質ゲート](../design/detailed/18-ci-quality-gates.md)          | CI 5ゲートとPlaywright運用                 | 全章        |

## 実装基盤層(並行開発即着手のための章)

| 章                                                                                    | 提供契約                                         | 主な利用章  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------- |
| [21環境変数](../design/detailed/21-environment-variables.md)                          | `.env.example` + envSchema(zod)                  | 全章        |
| [22ディレクトリと所有マップ](../design/detailed/22-directory-and-module-ownership.md) | apps/packages配置とファイル所有マップ            | 全章        |
| [23設定ファイル雛形](../design/detailed/23-config-file-templates.md)                  | package.json/tsconfig/vite/vitest/Dockerfile雛形 | 全章        |
| [24マイグレーション順序](../design/detailed/24-migrations.md)                         | 21ファイル順序付き、migrate.mjs骨格              | 全DDL所有章 |
| [25 API zodスキーマ](../design/detailed/25-api-zod-schemas.md)                        | packages/shared/src/api-schemas/                 | 全API所有章 |
| [26 CI YAML本体](../design/detailed/26-ci-yaml.md)                                    | .github/workflows/ci.yml完成版                   | 18          |
| [27共通モジュール契約](../design/detailed/27-shared-modules.md)                       | apps/server/src/shared/ 全関数の契約             | 全章        |
| [28テスト規約とテンプレート](../design/detailed/28-test-strategy.md)                  | unit/integ/e2e雛形とAAA、命名規約                | 全章        |
| [29 Kubernetes manifest](../design/detailed/29-kubernetes-manifests.md)               | manifests/ 完成版yaml                            | 16          |
| [30ローカル開発手順](../design/detailed/30-local-development.md)                      | docker-compose.yml + seed-local.mjs              | 全章        |

## 実装着手判定基準

以下3点が同時に満たされたとき、実装フェーズに進める。

1. 縦のトレーサビリティ: 上表で全FR/NFRが詳細設計章を持ち、テストIDが紐づくこと(本ファイルの状態)。
2. 横のテスト紐付け: 詳細設計の各章末尾の「テストID紐付け表」が[19エラーコード登録簿](../design/detailed/19-error-code-registry.md)・[20定数登録簿](../design/detailed/20-constants-registry.md)と矛盾しないこと。
3. 実装基盤層10章(詳細21〜30)が全て整備済みであること。
4. doclint 0/0/0/0、ADR交差決定green、MVPボーダリgreen、コーパス腐敗green、Rubricフレッシュネスgreen、traceability_check green、エラーコード横断100%登録。
