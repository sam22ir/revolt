import { defineConfig, devices } from "@playwright/test";

/** The local e2e Worker: real API plus a settable clock and a mock Google issuer. */
export const API_URL = "http://localhost:8788";

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
  webServer: [
    {
      // Fresh local D1 each run; nothing touches Cloudflare.
      command: "pnpm --filter @revolt/server e2e:serve",
      url: `${API_URL}/v1/state`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `VITE_API_URL=${API_URL} VITE_GOOGLE_MOCK=1 pnpm exec vite build && pnpm exec vite preview --port 4173 --strictPort`,
      url: "http://localhost:4173",
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
