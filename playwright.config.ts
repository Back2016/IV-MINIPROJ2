import { defineConfig } from "@playwright/test";
const port = process.env.ENSO_TEST_PORT || "4173";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1100 },
    headless: true,
    channel: process.env.ENSO_TEST_BROWSER || undefined,
  },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --strictPort --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
  reporter: [["list"], ["json", { outputFile: "docs/ui-test-results.json" }]],
});
