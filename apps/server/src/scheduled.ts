import { CLEANUP_MAX_ACCOUNTS, missingAlliances, runCleanup } from "./cleanup.ts";
import { pruneLive } from "./db/live-prune.ts";
import type { Deps, Env } from "./env.ts";

/** Cron Trigger (wrangler.jsonc `triggers.crons`): daily cleanup at the trigger's scheduled time. */
export const scheduled = async (scheduledTime: number, env: Env, deps: Pick<Deps, "map" | "room">): Promise<void> => {
  const r = await runCleanup(env.DB, scheduledTime, CLEANUP_MAX_ACCOUNTS, async (server, ids, endedAlliances) => {
    await deps.map(env, server).removeAccounts(ids, scheduledTime);
    for (const id of endedAlliances) {
      await deps.room(env, id).disband();
      await deps.map(env, server).removeAlliance(id, scheduledTime);
    }
  });
  // Leave, kick and disband write D1 first and tell the map best effort; if that call failed, an HQ of an alliance that
  // no longer exists stays on the map. Drop those here (removing an alliance is idempotent).
  const servers = await env.DB.prepare("SELECT DISTINCT server FROM accounts").all<{ server: string }>();
  for (const { server } of servers.results) {
    try {
      const map = deps.map(env, server);
      for (const id of await missingAlliances(env.DB, await map.hqAllianceIds())) await map.removeAlliance(id, scheduledTime);
    } catch (e) {
      console.error(`cleanup: ghost HQ sweep failed for ${server}`, e);
    }
  }
  const live = await pruneLive(env.DB, scheduledTime);
  console.log(`cleanup: pruned ${live.awards} awards, ${live.claims} claims, ${live.premium} old pass unlocks`);
  console.log(`cleanup: ${r.guests} stale guests, ${r.rateWindows} rate windows, ${r.helpRequests} help requests deleted`);
};
