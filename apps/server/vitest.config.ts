import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
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
