# 18 CI品質ゲート

## スコープ

CIパイプラインの必達ゲートのジョブ構成、実行コマンド、依存関係、カバレッジ閾値、OWASP TOP 10検査フェーズ(SAST + SCA + DAST +コンテナ脆弱性)、E2E retry/quarantine運用、gitleaks誤検知運用を集約する。

## 契約

### 必達ゲートのジョブ表

| 順序 | ジョブ名            | 実行コマンド                                                                                                                                                                   | 内容                                                                    |
| ---- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1    | `scan-secrets`      | `gitleaks detect --source . --redact`                                                                                                                                          | 秘密情報スキャン                                                        |
| 1b   | `migrate-dryrun`    | `pnpm migrate:dry`                                                                                                                                                             | マイグレーションSQL構文と適用順序検証(node-pg-migrate)                  |
| 1c   | `sca-audit`         | `pnpm audit --audit-level=high --prod`                                                                                                                                         | SCA: 既知CVEを含む依存解析(OWASP A06脆弱で古いコンポーネント)           |
| 2a   | `check-web`         | `cd apps/web && vp check`                                                                                                                                                      | フロントエンドのフォーマッタとlinter                                    |
| 2b   | `check-server`      | `cd apps/server && vp check`                                                                                                                                                   | サーバーのフォーマッタとlinter                                          |
| 2c   | `test-unit-web`     | `cd apps/web && vp test --coverage --coverage.thresholds.lines=80 --coverage.thresholds.statements=80 --coverage.thresholds.branches=70 --coverage.thresholds.functions=80`    | フロントエンドユニットテスト                                            |
| 2d   | `test-unit-server`  | `cd apps/server && vp test --coverage --coverage.thresholds.lines=80 --coverage.thresholds.statements=80 --coverage.thresholds.branches=70 --coverage.thresholds.functions=80` | サーバーユニットテスト                                                  |
| 2e   | `build-web`         | `cd apps/web && vp build`                                                                                                                                                      | 本番ビルド成立確認                                                      |
| 2f   | `build-server`      | `cd apps/server && pnpm tsc --noEmit`                                                                                                                                          | サーバー型検査                                                          |
| 2g   | `sast-semgrep`      | `semgrep ci --config=p/owasp-top-ten --config=p/typescript --config=p/javascript --config=p/nodejsscan --error`                                                                | SAST: OWASP TOP 10対応Semgrepルールセットで静的解析                     |
| 2h   | `container-scan`    | `trivy fs --severity HIGH,CRITICAL --exit-code 1 --no-progress . && trivy image --severity HIGH,CRITICAL --exit-code 1 ${IMAGE_TAG}`                                           | コンテナとファイルシステムの脆弱性スキャン                              |
| 3    | `test-e2e`          | `cd e2e && pnpm exec playwright test --reporter=html,junit,json --output=test-results`                                                                                         | E2Eテスト                                                               |
| 3b   | `dast-zap-baseline` | `docker run --rm -v $PWD/zap:/zap/wrk -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t ${PREVIEW_URL} -c zap-baseline.conf -r zap-report.html -J zap-report.json -m 10 -I` | DAST: OWASP ZAPベースラインスキャン(プレビュー環境に対する受動スキャン) |
| 4    | `summary`           | (集約)                                                                                                                                                                         | 全ジョブの結果集約と本番デプロイトリガ発行                              |

### ジョブ依存関係

```text
scan-secrets ──成功──> migrate-dryrun ──成功──> sca-audit ──成功──> {check-web, check-server,
                                                                  test-unit-web, test-unit-server,
                                                                  build-web, build-server,
                                                                  sast-semgrep, container-scan} (並列)
                                              └──全成功──> test-e2e ──成功──> dast-zap-baseline
                                                                      ──成功──> summary ──> deploy
```

| ジョブ                               | 失敗時の影響                                       |
| ------------------------------------ | -------------------------------------------------- |
| `scan-secrets` 失敗                  | 後続全停止(漏洩拡大防止)                           |
| `migrate-dryrun` 失敗                | 後続全停止(マイグレーション構文エラーの早期検出)   |
| `sca-audit` 失敗(High以上)           | 後続全停止(既知CVE混入の早期遮断)                  |
| 2a-2hいずれか失敗                    | 他は続行、`test-e2e` 以降は実行しない              |
| `sast-semgrep` 失敗                  | 2a-2gと同様、後続停止                              |
| `container-scan` 失敗(High/Critical) | 2a-2gと同様、後続停止                              |
| `test-e2e` 失敗                      | `dast-zap-baseline` 以降は実行しない、デプロイ禁止 |
| `dast-zap-baseline` 失敗             | `summary` は実行しない、デプロイ禁止               |

例外運用は本MVPで認めない。

## OWASP TOP 10検査フェーズ

本フェーズはOWASP TOP 10 (2021)の全カテゴリをCI上で機械検査する。検出ツールと適用カテゴリの対応は以下のとおりに固定する。

| OWASP TOP 10カテゴリ                          | 適用ツール                                         | ジョブ                                                  | 検出方式                                                 |
| --------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| A01アクセス制御の不備                         | Semgrep `p/owasp-top-ten` + Playwright RBAC E2E    | `sast-semgrep` + `test-e2e`                             | 認可関数の到達可能性とAPI境界の権限検証                  |
| A02暗号化の失敗                               | Semgrep `p/owasp-top-ten` + Trivy                  | `sast-semgrep` + `container-scan`                       | 弱い暗号アルゴリズム検出、HTTPS強制チェック              |
| A03インジェクション                           | Semgrep `p/owasp-top-ten` + Playwright XSS payload | `sast-semgrep` + `test-e2e`                             | SQL/XSS/コマンドインジェクション静的解析と動的検証       |
| A04安全でない設計                             | コードレビューと脅威モデリング(本ゲート外、PR必須) | (PR運用)                                                | 本MVP着手前に脅威モデルレビュー                          |
| A05セキュリティ設定ミス                       | Semgrep + Trivy + ZAP Baseline                     | `sast-semgrep` + `container-scan` + `dast-zap-baseline` | helmet設定、CSPヘッダ、CORS、デフォルト認証情報          |
| A06脆弱で古いコンポーネント                   | pnpm audit + Trivy                                 | `sca-audit` + `container-scan`                          | npm/コンテナイメージのCVE検出                            |
| A07識別認証の失敗                             | Semgrep + Playwright auth E2E                      | `sast-semgrep` + `test-e2e`                             | セッション固定、ブルートフォース耐性、パスワードリセット |
| A08ソフトウェアとデータの整合性               | gitleaks + Trivy +サブリソース整合性チェック       | `scan-secrets` + `container-scan` + `sast-semgrep`      | SRI、CI/CD改ざん検出、デシリアライゼーション             |
| A09セキュリティログとモニタリング失敗         | 監査ログ実装テスト+ Semgrep                        | `test-unit-server` + `sast-semgrep`                     | 監査ログ追記欠落の検出、改ざん検証バッチの有効性         |
| A10サーバーサイドリクエストフォージェリ(SSRF) | Semgrep + ZAP                                      | `sast-semgrep` + `dast-zap-baseline`                    | 外部URL検証、内部ネットワーク露出                        |

### Semgrep設定

`.semgrep.yml` で以下のルールセットを必達とする。

```yaml
rules:
  - p/owasp-top-ten
  - p/typescript
  - p/javascript
  - p/nodejsscan
  - p/express
  - p/jwt
  - p/security-audit

paths:
  exclude:
    - "node_modules"
    - "dist"
    - "coverage"
    - "**/*.test.ts"
    - "**/*.spec.ts"

severity:
  - ERROR
  - WARNING
```

検出されたERRORは即時CI失敗。WARNINGは `IMPROVEMENT_BACKLOG.md` への自動起票。

### Trivy設定

`trivy.yaml` で以下を必達とする。

```yaml
severity: HIGH,CRITICAL
ignore-unfixed: false
exit-code: 1
format: sarif
output: trivy-results.sarif
scan:
  - vuln
  - secret
  - misconfig
```

`vuln`(脆弱性)・`secret`(リポジトリ内秘密情報)・`misconfig`(Dockerfile/Kubernetes manifest誤設定)を同時スキャンする。

### OWASP ZAP Baseline設定

`zap-baseline.conf` で以下を必達とする。

```text
# OWASP TOP 10対応の受動スキャンに限定(active scanはステージング限定)
10010 IGNORE  # Cookie no HttpOnly flag - 除外: ゲスト用CookieはPath属性で別途防御
10011 IGNORE  # Cookie no Secure flag - 除外: 開発環境ローカル
10020 FAIL    # X-Frame-Options
10021 FAIL    # X-Content-Type-Options
10038 FAIL    # CSP header
10063 FAIL    # Permissions-Policy
10096 FAIL    # Timestamp Disclosure
40012 FAIL    # XSS reflected
40014 FAIL    # XSS persistent
40018 FAIL    # SQL injection
90019 FAIL    # SSRF
90020 FAIL    # Remote OS Command Injection
```

検出されたFAILはCI失敗。プレビュー環境のURL指定 `${PREVIEW_URL}` はPRごとに自動デプロイされたプレビュー環境のFQDNが入る。

### 定期的フルスキャン(本CIゲート外、週次cron)

ZAP Active Scanとペネトレーションテスト(NFR-04第14項)は別ジョブ `dast-zap-full` を週次cronで実行する(主CIには含めない)。これはステージング環境に対する能動スキャンであり、本番リリース前の品質ゲートとして扱う。

| 項目     | 値                                              |
| -------- | ----------------------------------------------- |
| 実行頻度 | 週次(日曜0時)                                   |
| 対象環境 | ステージング                                    |
| ツール   | OWASP ZAP Active Scan + manual penetration test |
| 結果     | GitHub Issue自動起票、Critical/Highは即時対応   |

### Vitestカバレッジ閾値の二重定義

`vitest.config.ts` でも宣言し、CIコマンドとの二重定義により事故を防ぐ。

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

### Playwright E2E運用

| 項目           | 値                                                                     |
| -------------- | ---------------------------------------------------------------------- |
| retries        | 1回(`playwright.config.ts` で固定)                                     |
| reporter       | `html, junit, json` の3形式                                            |
| artifacts      | スクリーンショット、ビデオ、トレースを失敗時に保存                     |
| quarantineタグ | 3回連続フレーキー検出時にタグ付与し当該テストをスキップ、専用Issue起票 |
| ブラウザ       | Chromium、WebKit、Firefoxの3系統で実行                                 |

quarantineタグ運用フロー

```text
1. flakyテストを Playwright report で検出(retries後にも失敗→pass→失敗のパターン)
2. 3回連続検出: GitHub Actions で auto-label "quarantine"
3. Playwrightテストの test.fixme(...) でスキップ
4. 専用Issue自動起票(template: quarantine.yml)
5. 修正PR で test.fixme を解除しquarantineラベルを外す
```

### gitleaks運用

| 項目         | 値                                                   |
| ------------ | ---------------------------------------------------- |
| 設定ファイル | `.gitleaks.toml`                                     |
| 除外パターン | 誤検知パターンを `[[rules.allowlists]]` で整備       |
| bypass権限   | リポジトリ管理者のみ(`gitleaks ignore` コミット権限) |
| 誤検知運用   | bypass前にsecurity_admin承認必須(PRレビュー)         |

### Vite+依存固定

| 項目                             | 値                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 依存バージョン                   | `package.json` で固定。MVP着手時の確定値は[20定数登録簿](./20-constants-registry.md)の `RUNTIME_VITE_PLUS_VERSION` を参照 |
| 更新手順                         | 専用ブランチで影響範囲確認後にメインへ。majorは差し替えADRを起票                                                          |
| Node.jsバージョン                | `.nvmrc` で固定。MVP着手時の確定値は[20定数登録簿](./20-constants-registry.md)の `RUNTIME_NODE_VERSION` を参照            |
| Vitestバージョン                 | Vite+が内部で固定する(`RUNTIME_VITEST_VERSION`)。直接指定はしない                                                         |
| Playwrightバージョン             | [20定数登録簿](./20-constants-registry.md)の `RUNTIME_PLAYWRIGHT_VERSION` を参照                                          |
| セキュリティスキャナのバージョン | gitleaks/semgrep/trivy/zaproxyの確定版数は[20定数登録簿](./20-constants-registry.md)の `SEC_*_VERSION` を参照             |

### エラーコード

| コード   | CIステータス | 意味                                             |
| -------- | ------------ | ------------------------------------------------ |
| `CI-001` | failure      | gitleaks検出(失敗)                               |
| `CI-002` | failure      | migrate-dryrunのSQL構文エラー                    |
| `CI-003` | failure      | カバレッジ閾値未達                               |
| `CI-004` | failure      | E2E主要導線テスト失敗                            |
| `CI-005` | warning      | quarantineラベル付テスト残存(マージ可、解消推奨) |
| `CI-006` | failure      | `pnpm audit` High以上のCVE検出                   |
| `CI-007` | failure      | Semgrep ERROR検出(OWASP TOP 10違反)              |
| `CI-008` | failure      | Trivy High/Critical検出                          |
| `CI-009` | failure      | OWASP ZAP Baseline FAIL検出                      |

詳細は[19エラーコード登録簿](./19-error-code-registry.md)参照。

## テストID紐付け

| 契約ID         | 内容                                                 | テストID | テスト種別 | CIゲート                                   |
| -------------- | ---------------------------------------------------- | -------- | ---------- | ------------------------------------------ |
| CI-CONTRACT-01 | 秘密情報混入PRでscan-secrets失敗                     | T-CI-001 | meta       | scan-secrets自己テスト                     |
| CI-CONTRACT-02 | migrate-dryrunで不正SQL検出                          | T-CI-002 | meta       | migrate-dryrun自己テスト                   |
| CI-CONTRACT-03 | カバレッジ79%でCIが失敗                              | T-CI-003 | meta       | test-unitの自己テスト                      |
| CI-CONTRACT-04 | E2E主要導線(login→edit→export)成功                   | T-CI-004 | e2e        | Playwright                                 |
| CI-CONTRACT-05 | 失敗時のスクリーンショット保存                       | T-CI-005 | meta       | e2e自己テスト                              |
| CI-CONTRACT-06 | High CVEを含むPRで `sca-audit` 失敗                  | T-CI-006 | meta       | sca-audit自己テスト(既知CVEモジュール注入) |
| CI-CONTRACT-07 | OWASP A03 SQLi混入PRでSemgrep ERROR                  | T-CI-007 | meta       | sast-semgrep自己テスト                     |
| CI-CONTRACT-08 | 旧baseイメージでTrivy Critical検出                   | T-CI-008 | meta       | container-scan自己テスト                   |
| CI-CONTRACT-09 | CSP違反プレビューでZAP FAIL                          | T-CI-009 | meta       | dast-zap-baseline自己テスト                |
| CI-CONTRACT-10 | OWASP TOP 10全カテゴリのカバー対応表が最新であること | T-CI-010 | meta       | 対応表のlint                               |

## トレーサビリティ

| 対応要件                                                                     | 対応基本設計節 | 対応ADR                      |
| ---------------------------------------------------------------------------- | -------------- | ---------------------------- |
| NFR-10(品質ゲート)、NFR-04(セキュリティのペネトレーションテストと脆弱性管理) | §11(全節)      | ADR-0009、ADR-0008、ADR-0025 |
