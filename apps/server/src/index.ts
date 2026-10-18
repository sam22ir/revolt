import { handle } from "./app.ts";
import { googleRemoteKeys } from "./auth/google.ts";
import { runCleanup } from "./cleanup.ts";
import type { Deps, Env } from "./env.ts";

const deps: Deps = { now: () => Date.now(), googleKeys: googleRemoteKeys() };

export default {
  fetch: (req: Request, env: Env): Promise<Response> => handle(req, env, deps),
  /** Cron Trigger (wrangler.jsonc `triggers.crons`): daily cleanup at the trigger's scheduled time. */
  scheduled: async (controller: { readonly scheduledTime: number }, env: Env): Promise<void> => {
    const r = await runCleanup(env.DB, controller.scheduledTime);
    console.log(`cleanup: ${r.guests} stale guests, ${r.rateWindows} rate windows deleted`);
  },
};
