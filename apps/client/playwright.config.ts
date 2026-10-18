import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/artifacts",
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Pixel 7"],
    baseURL: "http://localhost:4173",
  },
  projects: [{ name: "phone-chromium" }],
  webServer: {
    command: "pnpm exec vite build && pnpm exec vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
