import { defineConfig } from "vitest/config";

// Each test starts its own Miniflare D1, and alliance tests create dozens of accounts.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 60_000 } });
