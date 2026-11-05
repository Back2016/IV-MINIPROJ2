import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 1100 },
    headless: true,
  },
  webServer: {
    command: "npx vite preview --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  reporter: [["list"], ["json", { outputFile: "docs/ui-test-results.json" }]],
});
