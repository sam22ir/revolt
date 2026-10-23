// Uncommitted: same suite, servers started without pnpm (pnpm refuses to run in a worktree with linked node_modules).
import base from "./playwright.config.ts";
import { defineConfig } from "@playwright/test";
const W = "../server/node_modules/.bin/wrangler";
export default defineConfig({
  ...base,
  webServer: [
    { ...(base.webServer as any[])[0], command: `cd ../server && rm -rf .wrangler/e2e && ${W} d1 migrations apply DB --local --config wrangler.e2e.jsonc --persist-to .wrangler/e2e && ${W} dev --config wrangler.e2e.jsonc --port 8788 --persist-to .wrangler/e2e` },
    { ...(base.webServer as any[])[1], command: `VITE_API_URL=http://localhost:8788 VITE_GOOGLE_MOCK=1 node_modules/.bin/vite build && node_modules/.bin/vite preview --port 4173 --strictPort` },
  ],
});
