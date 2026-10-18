import { CLEANUP_MAX_ACCOUNTS, runCleanup } from "./cleanup.ts";
import type { Deps, Env } from "./env.ts";

/** Cron Trigger (wrangler.jsonc `triggers.crons`): daily cleanup at the trigger's scheduled time. */
export const scheduled = async (scheduledTime: number, env: Env, deps: Pick<Deps, "map">): Promise<void> => {
  const r = await runCleanup(env.DB, scheduledTime, CLEANUP_MAX_ACCOUNTS, async (server, ids) => {
    await deps.map(env, server).removeAccounts(ids, scheduledTime);
  });
  console.log(`cleanup: ${r.guests} stale guests, ${r.rateWindows} rate windows deleted`);
};
