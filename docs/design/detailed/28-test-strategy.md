# 28テスト規約とテンプレート

## スコープ

unit/integ/E2Eの配置、ファイル命名、フィクスチャ管理、テスト雛形を集約する。各章のテストID紐付け表と1対1で対応する具体のテストファイルを書く根拠とする。

## ファイル配置と命名

| 種別       | 配置                                         | ファイル命名         | フレームワーク                                                                 |
| ---------- | -------------------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| unit       | `apps/*/tests/` 内、対象ファイルと同階層構造 | `<対象名>.test.ts`   | Vitest                                                                         |
| integ      | `apps/server/tests/integ/`                   | `<feature>.integ.ts` | Vitest + testcontainers(`@testcontainers/postgresql`, `@testcontainers/redis`) |
| e2e        | `e2e/tests/`                                 | `<feature>.spec.ts`  | Playwright                                                                     |
| meta(self) | `tools/*/__tests__/`                         | `<tool>.test.mjs`    | Node tap                                                                       |

## AAA pattern

全テストはArrange-Act-Assertで書く。コメント `// arrange` `// act` `// assert` を必須とする(eslint-plugin-vitest経由でlintできる)。

```ts
// 例: apps/server/src/features/suggestion/accept.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { acceptSuggestion } from "./accept.js";

describe("acceptSuggestion two-phase CAS", () => {
  it("returns SUG-001 when optimistic_version mismatches", async () => {
    // arrange
    const tx = mockTx({ suggestion: { id: "A", optimistic_version: 5, status: "pending" } });

    // act
    const result = await acceptSuggestion(tx, { suggestion_id: "A", expected_v: 4, user_id: "U" });

    // assert
    expect(result.error?.code).toBe("SUG-001");
    expect(result.httpStatus).toBe(409);
  });
});
```

## フィクスチャ管理

- `apps/server/tests/fixtures/` にユーザー/文書/ロールの最小データを宣言。
- integテストはtestcontainersで空DBを起動してマイグレーションをかけ、フィクスチャを `INSERT` する。
- E2Eは `pnpm seed:local`(詳細30)で投入されるシードを利用。

```ts
// e2e/fixtures/users.ts
export const TEST_USERS = {
  alice: {
    email: "alice@example.com",
    password: "alice-strong-password-1!",
    display_name: "Alice",
    roles: ["standard"],
  },
  ops: {
    email: "ops@example.com",
    password: "ops-strong-password-1!",
    display_name: "Ops",
    roles: ["standard", "operations_admin"],
  },
  cs: {
    email: "cs@example.com",
    password: "cs-strong-password-1!",
    display_name: "CS",
    roles: ["standard", "cs_admin"],
  },
};
```

## Playwright E2E雛形

```ts
// e2e/tests/auth.spec.ts
import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../fixtures/users.js";

test.describe("AUTH", () => {
  test("AUTH-008 unauthenticated WS upgrade returns 401", async ({ request }) => {
    const res = await request.get("/sharedb", {
      headers: { Upgrade: "websocket", Connection: "Upgrade" },
    });
    expect(res.status()).toBe(401);
  });

  test("AUTH-003 account locks after 5 failures", async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.goto("/login");
      await page.getByLabel("Email").fill(TEST_USERS.alice.email);
      await page.getByLabel("Password").fill("wrong-password");
      await page.getByRole("button", { name: "Login" }).click();
    }
    await expect(page.getByText("Account locked")).toBeVisible();
  });
});
```

```ts
// e2e/tests/suggestion.spec.ts
import { test, expect } from "@playwright/test";
import { TEST_USERS, loginAs, openDocument, idleWait } from "../fixtures/index.js";

test("SUG-008 propose→accept→reflect in body", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobCtx = await browser.newContext();
  const bobPage = await bobCtx.newPage();

  await loginAs(alicePage, TEST_USERS.alice);
  await loginAs(bobPage, TEST_USERS.alice); // 同じ owner で別tab

  const docId = await openDocument(alicePage);
  await openDocument(bobPage, docId);

  // arrange: enable suggestion mode and type
  await bobPage.getByRole("button", { name: "Suggestion mode" }).click();
  await bobPage.locator(".ql-editor").type("Hello suggestion");
  await idleWait(bobPage, 5500); // 5秒区切り

  // act: alice accepts
  await alicePage.getByRole("button", { name: "Suggestions" }).click();
  await alicePage.getByRole("button", { name: "Accept" }).click();

  // assert: both pages see the text
  await expect(alicePage.locator(".ql-editor")).toContainText("Hello suggestion");
  await expect(bobPage.locator(".ql-editor")).toContainText("Hello suggestion");
});
```

## integテスト雛形(testcontainers)

```ts
// apps/server/tests/integ/audit-emit.integ.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { runMigrations } from "../helpers/migrate.js";
import { emitAudit } from "../../src/shared/audit-emit/index.js";

describe("AUD-CONTRACT-03 advisory lock seq monotonic", () => {
  let pool: Pool;
  beforeAll(async () => {
    const pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    pool = new Pool({ connectionString: pg.getConnectionUri() });
    await runMigrations(pool);
    await pool.query(
      `INSERT INTO secret_versions(id, secret_name, version, key_material) VALUES (gen_random_uuid(), 'AUDIT_HASH_SALT', 1, decode('${"00".repeat(32)}', 'hex'))`,
    );
  });
  afterAll(async () => {
    await pool.end();
  });

  it("parallel emits produce strictly monotonic seq", async () => {
    // arrange
    const N = 50;
    // act
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        emitAudit(
          pool,
          {
            actor: { kind: "system" },
            target_kind: "system",
            target_id: "00000000-0000-0000-0000-000000000000",
            action: "test",
            payload: {},
          },
          1,
        ),
      ),
    );
    // assert
    const seqs = results.map((r) => Number(r.seq)).sort((a, b) => a - b);
    expect(seqs).toEqual([...Array(N).keys()].map((i) => i + 1));
  });
});
```

## カバレッジ閾値(再掲)

| 区分       | 閾値 |
| ---------- | ---- |
| statements | 80%  |
| branches   | 70%  |
| functions  | 80%  |
| lines      | 80%  |

カバレッジ閾値はテストランナーCLI+ `vitest.config.ts` の二重定義で強制。

## quarantineタグ運用(詳細18と整合)

- Playwrightで3回連続フレーキー検出されたテストは `test.fixme(name, ...)` でスキップ。
- GitHub Actionsで `quarantine` ラベルが付与され、`.github/ISSUE_TEMPLATE/quarantine.yml` から自動Issue起票。
- マージにはquarantineラベルを保持してよいが、`summary` ジョブで残存数が閾値超過時はwarning(CI失敗ではない、`CI-005`)。

## 視覚回帰テスト(本MVPでは対象外、将来拡張)

本MVPはユニット/integ/E2Eのみとし、Percy/Chromaticは導入しない。視覚的に重要な領域(エディタ、提案ハイライト、コメントカード)はa11yチェックで担保する。

## テストID命名規約

- `T-<前置3-5文字>-NNN`
- 前置はエラーコード接頭辞と一致(例: `T-AUTH-001`、`T-SUG-001`)
- 100番台はunit、200番台はinteg、300番台はE2E、900番台はmeta(本MVP順守)

## エラーコード(本章は静的、ランタイムなし)

## トレーサビリティ

| 対応要件                       | 対応基本設計節 | 対応ADR  |
| ------------------------------ | -------------- | -------- |
| NFR-10(品質ゲートのテスト分類) | §11            | ADR-0009 |
