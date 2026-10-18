import type { Db, DbStatement } from "./db/db.ts";
import { deleteOldGuestRate } from "./db/guest-rate.ts";

export const STALE_GUEST_MS = 30 * 24 * 60 * 60 * 1000;
/** Accounts deleted per run, so one run stays well inside free-tier D1 limits. Leftovers go on the next run. */
export const CLEANUP_MAX_ACCOUNTS = 500;
/** Ids per statement, well under D1's cap on bound parameters (100 per statement in its limits page). */
const CHUNK = 50;

/** No Google link and no session: nobody can sign in to this account again. */
const UNREACHABLE = "google_sub IS NULL AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.account_id = accounts.id)";

/**
 * Ids of guests with no session whose latest activity (creation, last session
 * ended, last base write) is at least 30 days before `now`.
 */
const findStaleGuests = async (db: Db, now: number, max: number): Promise<{ id: string; server: string }[]> => {
  const r = await db
    .prepare(
      `SELECT accounts.id AS id, accounts.server AS server FROM accounts LEFT JOIN bases ON bases.account_id = accounts.id
       WHERE ${UNREACHABLE}
         AND MAX(accounts.created_at, COALESCE(accounts.last_seen_at, 0), COALESCE(bases.updated_at, 0)) <= ?
       LIMIT ?`,
    )
    .bind(now - STALE_GUEST_MS, max)
    .all<{ id: string; server: string }>();
  return r.results;
};

const deleteChunk = (db: Db, ids: string[]): DbStatement[] => {
  const list = ids.map(() => "?").join(", ");
  const guarded = `SELECT id FROM accounts WHERE id IN (${list}) AND ${UNREACHABLE}`;
  return [
    db.prepare(`DELETE FROM reports WHERE account_id IN (${guarded})`).bind(...ids),
    db.prepare(`DELETE FROM bases WHERE account_id IN (${guarded})`).bind(...ids),
    db.prepare(`DELETE FROM accounts WHERE id IN (${guarded})`).bind(...ids),
  ];
};

export interface CleanupResult {
  readonly guests: number;
  readonly rateWindows: number;
}

/** Called with the deleted accounts of each server, so the map can drop their bases and marches. */
export type OnDeleted = (server: string, ids: string[]) => Promise<void>;

/**
 * The daily job: deletes stale guest accounts with their bases and reports, then their
 * places on the map, and expired rate-limit counters.
 */
export const runCleanup = async (db: Db, now: number, max = CLEANUP_MAX_ACCOUNTS, onDeleted?: OnDeleted): Promise<CleanupResult> => {
  const stale = await findStaleGuests(db, now, max);
  const ids = stale.map((s) => s.id);
  const statements: DbStatement[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) statements.push(...deleteChunk(db, ids.slice(i, i + CHUNK)));
  // One batch is one transaction: a base is never deleted without its account, or the reverse.
  if (statements.length > 0) await db.batch(statements);
  if (onDeleted !== undefined) {
    const byServer = new Map<string, string[]>();
    for (const s of stale) byServer.set(s.server, [...(byServer.get(s.server) ?? []), s.id]);
    for (const [server, list] of byServer) await onDeleted(server, list);
  }
  return { guests: ids.length, rateWindows: await deleteOldGuestRate(db, now) };
};
