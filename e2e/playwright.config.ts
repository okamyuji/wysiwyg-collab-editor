import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI ? { workers: 4 } : {}),
  reporter: process.env.CI
    ? [
        ["html", { open: "never" }],
        ["junit", { outputFile: "test-results/junit.xml" }],
        ["json", { outputFile: "test-results/report.json" }],
      ]
    : [["html", { open: "on-failure" }]],
  // Starts the web dev server (its Vite plugin hosts the collab socket) unless PREVIEW_URL points elsewhere.
  ...(process.env.PREVIEW_URL
    ? {}
    : {
        webServer: {
          command: "pnpm --dir ../apps/web exec vite --host 127.0.0.1 --port 5173 --strictPort",
          url: "http://localhost:5173",
          reuseExistingServer: !process.env.CI,
        },
      }),
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
