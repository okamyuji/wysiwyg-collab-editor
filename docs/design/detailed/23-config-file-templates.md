# 23設定ファイル雛形

## スコープ

ルート/各アプリの設定ファイル本文を集約する。本章のテキストをそのままリポジトリにコピーすれば動作する完成版とする。

## `package.json` (ルート)

```json
{
  "name": "wysiwyg-collab-editor",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24.0.0" },
  "packageManager": "pnpm@11.9.0",
  "scripts": {
    "dev": "pnpm --filter ./apps/web dev & pnpm --filter ./apps/server dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "check": "pnpm -r check",
    "migrate": "node tools/migrate.mjs up",
    "migrate:dry": "node tools/migrate.mjs dry",
    "seed:local": "node tools/seed-local.mjs",
    "traceability:check": "node tools/traceability_check.mjs"
  }
}
```

## `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "e2e"
```

## `tsconfig.base.json` (ルート)

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "useDefineForClassFields": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## `apps/server/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

## `apps/web/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["vite/client"]
  },
  "include": ["src/**/*"]
}
```

## `apps/web/vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          { urlPattern: /\/api\/documents\/.*/, handler: "NetworkFirst" },
          {
            urlPattern: /\/api\/documents\/.*\/images\/.*/,
            handler: "CacheFirst",
            options: { cacheName: "images", expiration: { maxEntries: 50 } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, host: true },
  build: { sourcemap: true, target: "es2023" },
});
```

## `apps/server/vitest.config.ts` (および `apps/web/vitest.config.ts`)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node", // apps/web は 'jsdom'
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
      exclude: ["**/*.test.ts", "**/*.integ.ts", "**/types.ts", "dist/**"],
    },
    include: ["tests/**/*.test.ts", "tests/**/*.integ.ts"],
  },
});
```

## `e2e/playwright.config.ts`

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [
        ["html", { open: "never" }],
        ["junit", { outputFile: "test-results/junit.xml" }],
        ["json", { outputFile: "test-results/report.json" }],
      ]
    : [["html", { open: "on-failure" }]],
  use: {
    baseURL: process.env.PREVIEW_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
```

## `.nvmrc`

```text
24
```

## `.gitleaks.toml`

```toml
title = "wysiwyg-collab-editor gitleaks config"

[extend]
useDefault = true

[[rules]]
id = "audit-hash-salt"
description = "AUDIT_HASH_SALT in source"
regex = '''AUDIT_HASH_SALT_v\d+\s*=\s*[A-Za-z0-9+/=]{32,}'''
tags = ["secret"]

[[rules.allowlists]]
description = "allow .env.example placeholder"
paths = ['''^\.env\.example$''']

[allowlist]
description = "global ignore"
paths = [
  '''(^|/)docs/''',
  '''(^|/)tests/fixtures/''',
  '''(^|/)e2e/fixtures/''',
]
```

## `.semgrep.yml`

```yaml
rules:
  - p/owasp-top-ten
  - p/typescript
  - p/javascript
  - p/nodejsscan
  - p/express
  - p/jwt
  - p/security-audit
  - p/sql-injection
  - p/xss

paths:
  exclude:
    - "node_modules"
    - "dist"
    - "coverage"
    - "**/*.test.ts"
    - "**/*.integ.ts"
    - "e2e/**"

severity:
  - ERROR
  - WARNING
```

## `trivy.yaml`

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
skip-files:
  - "docs/**"
  - "**/*.md"
```

## `zap-baseline.conf`

```text
10010 IGNORE
10011 IGNORE
10020 FAIL
10021 FAIL
10038 FAIL
10063 FAIL
10096 FAIL
40012 FAIL
40014 FAIL
40018 FAIL
90019 FAIL
90020 FAIL
```

## `eslint.config.js` (Vite+ `vp check` がデフォルト統合する場合のbase override)

```js
import boundaries from "eslint-plugin-boundaries";

export default [
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "feature", pattern: "apps/*/src/features/*" },
        { type: "shared", pattern: "apps/*/src/shared/*" },
        { type: "package", pattern: "packages/*" },
      ],
    },
    rules: {
      "boundaries/no-unknown": "error",
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "feature", allow: ["shared", "package"] },
            { from: "shared", allow: ["shared", "package"] },
            { from: "package", allow: ["package"] },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message: "CSP-004: dangerouslySetInnerHTML is forbidden, use dompurify.",
        },
      ],
    },
  },
];
```

## `docker/app-server.Dockerfile`

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/server apps/server
COPY packages packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./apps/server build

FROM gcr.io/distroless/nodejs24-debian12 AS runtime
WORKDIR /app
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
USER nonroot:nonroot
EXPOSE 3000
CMD ["dist/main.js"]
```

## `docker/export-worker.Dockerfile`

```dockerfile
FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
  && rm -rf /var/lib/apt/lists/*
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/export-worker apps/export-worker
COPY packages packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./apps/export-worker exec playwright install --with-deps chromium
RUN pnpm --filter ./apps/export-worker build
USER node
CMD ["node", "apps/export-worker/dist/main.js"]
```

## トレーサビリティ

| 対応要件               | 対応基本設計節 | 対応ADR                                |
| ---------------------- | -------------- | -------------------------------------- |
| NFR-10、NFR-04、NFR-07 | §8、§9、§11    | ADR-0008、ADR-0009、ADR-0017、ADR-0028 |
