# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-06-28

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

- For Vite+ projects, formatter/linter commands should use the ox toolchain (`vp fmt`/Oxfmt and `vp lint`/Oxlint), not Prettier/ESLint.
- When adding dependencies, prefer the latest versions that satisfy peer dependencies and do not break the project.
- App UI should support both Japanese and English, with automatic switching from the browser language; product/app names can remain English.
- For this editor, E2E coverage must include the core online multi-user editing path and document decoration path, not only shell navigation.
- For this editor, export verification must generate all supported formats with decorated Japanese/English content and inspect the produced files, not only select the UI option.
- OWASP Top 10 validation is expected as an explicit security gate, not an implicit code-review claim.

## Key Learnings

- **Project:** wysiwyg-collab-editor
- pnpm 11 requires build-script allowlisting in `pnpm-workspace.yaml`; Vite scaffolding must approve `esbuild` with `allowBuilds.esbuild: true`.
- Server infrastructure modules live under `apps/server/src/config` and `apps/server/src/shared`; in parallel development, treat root package/config files as other-worker-owned unless explicitly assigned.
- Env boolean parsing should be explicit for string values so `REDIS_TLS=false` and `S3_FORCE_PATH_STYLE=false` do not become truthy.
- App tsconfig files with `rootDir: "src"` should include only `src/**/*`; typecheck package-level Vite/Vitest configs through a separate config if needed.
- The initial `packages/shared` and `packages/doc-canonical` implementation compiles independently with package-local `npm install --prefix ... --no-package-lock`; root manifests may be owned by another worker during parallel scaffolding.
- Use `rtk proxy sh -c 'test -f ...'` for shell builtin file checks; bare `rtk test -f ...` is parsed incorrectly in this workspace.
- Current implementation state is a generated initial monorepo scaffold from detailed design; final integration gates are `pnpm install`, `pnpm check`, `pnpm build`, `pnpm test`, `pnpm migrate:dry`, and `pnpm traceability:check`.
- Vite+ lint should target owned paths and ignore `dist`/`node_modules`; otherwise Oxlint can traverse third-party code and emit dependency warnings.
- Latest `@vitejs/plugin-react` includes the OXC React transform path and pairs with Vite 8; `@vitejs/plugin-react-oxc` is deprecated.
- Playwright 1.61 with `exactOptionalPropertyTypes` requires optional config keys like `workers` to be omitted instead of set to `undefined`.
- Japanese labels can be longer than English; verify button text visually on mobile, not only by checking DOM overflow.
- React server rendering tests should not read browser storage during `useState` initialization; load persisted drafts after mount to avoid Node `localStorage` warnings.
- Playwright `getByLabel()` is partial by default enough to collide with `Formatting toolbar` and `Format`; scope panel controls when labels share prefixes.
- `@pdf-lib/fontkit` can fail on WOFF/CFF fonts with `Unknown op: 0`; use TTF assets for PDF CJK font embedding.
- Parallel Playwright tests must not share fixed download output filenames; use `testInfo.outputPath()` to avoid cross-test overwrites.
- Semgrep registry configs such as `p/owasp-top-ten` should be passed as CLI `--config` values, not listed as strings under `rules:` in a local YAML file.

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- [2026-06-28] Do not use compound `find` predicates through `rtk`; the wrapper rejects them. Use `rg --files -g ...` or simpler `rtk find` calls instead.
- [2026-06-28] Do not combine null/number/boolean/string canonicalization when calling `.normalize`; split string normalization into its own branch under strict TypeScript.
- [2026-06-28] Do not assume this scaffold workspace has Git metadata; if `.git` is absent, report file changes from filesystem discovery instead of `git status`.
- [2026-06-28] Do not treat selecting an export format as export verification; download PDF/DOCX/Markdown and inspect text, structure, and render output.

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
