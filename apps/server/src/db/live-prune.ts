import { passSeasonAt } from "@revolt/rules";
import type { Db } from "./db.ts";

/** Award rows and claims older than this are dropped. Longer than any event window plus its claim grace, and a pass season. */
export const LIVE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
/** Pass-premium rows for seasons older than this many seasons back are dropped. */
export const PASS_SEASONS_KEPT = 3;

/**
 * Housekeeping for the live tables. Event windows and pass seasons are computed from the clock, so nothing here is
 * needed for events to roll over; a missed run only leaves old rows a little longer.
 */
export const pruneLive = async (db: Db, now: number): Promise<{ awards: number; claims: number; premium: number }> => {
  const cutoff = now - LIVE_RETENTION_MS;
  const awards = await db.prepare("DELETE FROM live_awards WHERE at < ?").bind(cutoff).run();
  const claims = await db.prepare("DELETE FROM claims WHERE at < ?").bind(cutoff).run();
  const premium = await db.prepare("DELETE FROM pass_premium WHERE season < ?").bind(passSeasonAt(now).index - PASS_SEASONS_KEPT).run();
  return { awards: awards.meta.changes, claims: claims.meta.changes, premium: premium.meta.changes };
};
