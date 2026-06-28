# 26 CI YAML本体

## スコープ

GitHub Actionsで実行する `ci.yml` `dast-zap-full.yml` の完全な本文を集約する。詳細18のジョブ表をyamlに転写する。

## `.github/workflows/ci.yml`

```yaml
name: ci

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: 24
  PNPM_VERSION: 11.9.0

jobs:
  scan-secrets:
    name: scan-secrets
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: gitleaks
        uses: gitleaks/gitleaks-action@v2
        with:
          config-path: .gitleaks.toml

  migrate-dryrun:
    name: migrate-dryrun
    runs-on: ubuntu-24.04
    needs: [scan-secrets]
    services:
      postgres:
        image: postgres:18-alpine
        env:
          POSTGRES_USER: ci
          POSTGRES_PASSWORD: ci
          POSTGRES_DB: ci
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm migrate:dry
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_NAME: ci
          DB_USER: ci
          DB_PASSWORD: ci
          DB_SSL_MODE: disable

  sca-audit:
    name: sca-audit
    runs-on: ubuntu-24.04
    needs: [migrate-dryrun]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level=high --prod

  check-web:
    name: check-web
    runs-on: ubuntu-24.04
    needs: [sca-audit]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter ./apps/web check

  check-server:
    name: check-server
    runs-on: ubuntu-24.04
    needs: [sca-audit]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter ./apps/server check

  test-unit-web:
    name: test-unit-web
    runs-on: ubuntu-24.04
    needs: [sca-audit]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter ./apps/web test --coverage --coverage.thresholds.lines=80 --coverage.thresholds.statements=80 --coverage.thresholds.branches=70 --coverage.thresholds.functions=80
      - uses: actions/upload-artifact@v4
        with: { name: coverage-web, path: apps/web/coverage }

  test-unit-server:
    name: test-unit-server
    runs-on: ubuntu-24.04
    needs: [sca-audit]
    services:
      postgres:
        image: postgres:18-alpine
        env: { POSTGRES_USER: ci, POSTGRES_PASSWORD: ci, POSTGRES_DB: ci }
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      redis:
        image: redis:8-alpine
        ports: ['6379:6379']
        options: --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter ./apps/server test --coverage --coverage.thresholds.lines=80 --coverage.thresholds.statements=80 --coverage.thresholds.branches=70 --coverage.thresholds.functions=80
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_NAME: ci
          DB_USER: ci
          DB_PASSWORD: ci
          DB_SSL_MODE: disable
          REDIS_URL: redis://localhost:6379/0
          NODE_ENV: test
      - uses: actions/upload-artifact@v4
        with: { name: coverage-server, path: apps/server/coverage }

  build-web:
    name: build-web
    runs-on: ubuntu-24.04
    needs: [sca-audit]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter ./apps/web build
      - uses: actions/upload-artifact@v4
        with: { name: web-dist, path: apps/web/dist }

  build-server:
    name: build-server
    runs-on: ubuntu-24.04
    needs: [sca-audit]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter ./apps/server exec tsc --noEmit

  sast-semgrep:
    name: sast-semgrep
    runs-on: ubuntu-24.04
    needs: [sca-audit]
    container: returntocorp/semgrep:1.168.0
    steps:
      - uses: actions/checkout@v4
      - run: semgrep ci --config=.semgrep.yml --error

  container-scan:
    name: container-scan
    runs-on: ubuntu-24.04
    needs: [sca-audit]
    steps:
      - uses: actions/checkout@v4
      - uses: aquasecurity/trivy-action@0.24.0
        with:
          scan-type: fs
          scan-ref: .
          severity: HIGH,CRITICAL
          exit-code: 1
          ignore-unfixed: false
          format: sarif
          output: trivy-fs.sarif
      - name: docker build app-server
        run: docker build -f docker/app-server.Dockerfile -t app-server:${{ github.sha }} .
      - name: docker build export-worker
        run: docker build -f docker/export-worker.Dockerfile -t export-worker:${{ github.sha }} .
      - uses: aquasecurity/trivy-action@0.24.0
        with:
          scan-type: image
          image-ref: app-server:${{ github.sha }}
          severity: HIGH,CRITICAL
          exit-code: 1
      - uses: aquasecurity/trivy-action@0.24.0
        with:
          scan-type: image
          image-ref: export-worker:${{ github.sha }}
          severity: HIGH,CRITICAL
          exit-code: 1
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: trivy-results, path: trivy-*.sarif }

  test-e2e:
    name: test-e2e
    runs-on: ubuntu-24.04
    needs: [check-web, check-server, test-unit-web, test-unit-server, build-web, build-server, sast-semgrep, container-scan]
    services:
      postgres:
        image: postgres:18-alpine
        env: { POSTGRES_USER: ci, POSTGRES_PASSWORD: ci, POSTGRES_DB: ci }
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      redis:
        image: redis:8-alpine
        ports: ['6379:6379']
        options: --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5
      minio:
        image: minio/minio:RELEASE.2025-10-15T17-29-55Z
        env: { MINIO_ROOT_USER: ci, MINIO_ROOT_PASSWORD: ciciciciciciciciciciciciciciciciciciciciciciciciciciciciciciciic }
        ports: ['9000:9000']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: ${{ env.PNPM_VERSION }} }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm migrate up
        env: { DB_HOST: localhost, DB_PORT: 5432, DB_NAME: ci, DB_USER: ci, DB_PASSWORD: ci, DB_SSL_MODE: disable }
      - run: pnpm seed:local
      - run: pnpm --filter ./apps/server build && pnpm --filter ./apps/server exec node dist/main.js &
      - run: pnpm --filter ./apps/web build && pnpm --filter ./apps/web exec vite preview --port 5173 &
      - run: sleep 10
      - run: pnpm --filter ./e2e exec playwright install --with-deps
      - run: pnpm --filter ./e2e test --reporter=html,junit,json --output=test-results
        env: { PREVIEW_URL: http://localhost:5173 }
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: e2e-results, path: |
          e2e/test-results
          e2e/playwright-report }

  dast-zap-baseline:
    name: dast-zap-baseline
    runs-on: ubuntu-24.04
    needs: [test-e2e]
    steps:
      - uses: actions/checkout@v4
      - name: launch preview
        run: |
          docker compose -f docker-compose.yml up -d
          sleep 30
      - name: zap baseline
        run: |
          docker run --rm --network host \
            -v $PWD/zap:/zap/wrk \
            -t ghcr.io/zaproxy/zaproxy:2.17.0 \
            zap-baseline.py -t http://localhost:5173 -c zap-baseline.conf -r zap-report.html -J zap-report.json -m 10 -I
        continue-on-error: false
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: zap-report, path: zap }

  traceability-check:
    name: traceability-check
    runs-on: ubuntu-24.04
    needs: [sca-audit]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }} }
      - run: node tools/traceability_check.mjs

  doclint:
    name: doclint
    runs-on: ubuntu-24.04
    needs: [scan-secrets]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: python3 tools/lint_docs.py docs/

  summary:
    name: summary
    runs-on: ubuntu-24.04
    needs:
      - scan-secrets
      - migrate-dryrun
      - sca-audit
      - check-web
      - check-server
      - test-unit-web
      - test-unit-server
      - build-web
      - build-server
      - sast-semgrep
      - container-scan
      - test-e2e
      - dast-zap-baseline
      - traceability-check
      - doclint
    if: always()
    steps:
      - run: |
          if [ "${{ contains(needs.*.result, 'failure') }}" = "true" ]; then
            echo "CI failed"; exit 1
          fi
          echo "CI passed"
```

## `.github/workflows/dast-zap-full.yml`

```yaml
name: dast-zap-full
on:
  schedule:
    - cron: "0 0 * * 0" # 日曜0時UTC
  workflow_dispatch:

jobs:
  zap-full:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - name: zap full scan
        run: |
          docker run --rm \
            -v $PWD/zap:/zap/wrk \
            -t ghcr.io/zaproxy/zaproxy:2.17.0 \
            zap-full-scan.py -t ${{ secrets.STAGING_URL }} -r zap-full.html -J zap-full.json -I
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: zap-full-report, path: zap }
      - name: create issue on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `[DAST] ZAP full scan failure ${new Date().toISOString().slice(0,10)}`,
              body: 'ZAP Active Scan detected Critical/High findings. See artifact `zap-full-report`.',
              labels: ['security','dast'],
            })
```

## `tools/traceability_check.mjs` 骨格

```mjs
#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const findings = [];

// 1. FR-NN/NFR-NN→ 詳細章リンクが解決するか
const matrix = readFileSync("docs/_quality/TRACEABILITY_MATRIX.md", "utf-8");
const refs = [...matrix.matchAll(/\((\.\.\/design\/detailed\/[0-9_a-z\-]+\.md)\)/g)].map(
  (m) => m[1],
);
for (const ref of refs) {
  try {
    readFileSync(`docs/_quality/${ref}`);
  } catch {
    findings.push(`MISSING ref: ${ref}`);
  }
}

// 2. エラーコード横断: 全章で使われたコードが19レジストリに登録済みか
const allCodes = execSync(
  "grep -rohE '`[A-Z]+[A-Z0-9]*-[0-9]{3}`' docs/design/detailed/ --include='*.md'",
)
  .toString()
  .split("\n")
  .filter(Boolean)
  .sort();
const registry = readFileSync("docs/design/detailed/19-error-code-registry.md", "utf-8");
for (const code of new Set(allCodes)) {
  if (!registry.includes(code)) findings.push(`UNREGISTERED error: ${code}`);
}

if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log("traceability OK");
```

## エラーコード(本章はCIジョブ単位、詳細18の `CI-NNN` と統合)

## テストID紐付け

| 契約ID          | 内容                                   | テストID  | テスト種別 | CIゲート                               |
| --------------- | -------------------------------------- | --------- | ---------- | -------------------------------------- |
| YML-CONTRACT-01 | 全ジョブのneedsが詳細18の依存表と一致  | T-YML-001 | meta       | actionlint                             |
| YML-CONTRACT-02 | summaryが全needsの失敗を検知してexit 1 | T-YML-002 | meta       | 自己テスト                             |
| YML-CONTRACT-03 | traceability-checkが先送り表現を検出   | T-YML-003 | meta       | tools/traceability_check.mjs自己テスト |

## トレーサビリティ

| 対応要件               | 対応基本設計節 | 対応ADR  |
| ---------------------- | -------------- | -------- |
| NFR-10(品質ゲート全般) | §11            | ADR-0009 |
