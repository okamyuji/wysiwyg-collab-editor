import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    // Node 25+ exposes a global localStorage that is undefined without --localstorage-file and shadows jsdom's.
    execArgv: ["--no-experimental-webstorage"],
    environmentOptions: {
      jsdom: {
        url: "http://localhost:5173",
      },
    },
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
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "tests/**/*.integ.ts"],
  },
});
