import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    semi: true,
    printWidth: 100,
    sortPackageJson: false,
    ignorePatterns: [
      "node_modules",
      "dist",
      "coverage",
      "playwright-report",
      "test-results",
      ".wolf",
    ],
  },
});
