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
const findStaleGuests = async (db: Db, now: number, max: number): Promise<string[]> => {
  const r = await db
    .prepare(
      `SELECT accounts.id AS id FROM accounts LEFT JOIN bases ON bases.account_id = accounts.id
       WHERE ${UNREACHABLE}
         AND MAX(accounts.created_at, COALESCE(accounts.last_seen_at, 0), COALESCE(bases.updated_at, 0)) <= ?
       LIMIT ?`,
    )
    .bind(now - STALE_GUEST_MS, max)
    .all<{ id: string }>();
  return r.results.map((row) => row.id);
};

const deleteChunk = (db: Db, ids: string[]): DbStatement[] => {
  const list = ids.map(() => "?").join(", ");
  const guarded = `SELECT id FROM accounts WHERE id IN (${list}) AND ${UNREACHABLE}`;
  return [
    db.prepare(`DELETE FROM bases WHERE account_id IN (${guarded})`).bind(...ids),
    db.prepare(`DELETE FROM accounts WHERE id IN (${guarded})`).bind(...ids),
  ];
};

export interface CleanupResult {
  readonly guests: number;
  readonly rateWindows: number;
}

/** The daily job: deletes stale guest accounts with their bases, and expired rate-limit counters. */
export const runCleanup = async (db: Db, now: number, max = CLEANUP_MAX_ACCOUNTS): Promise<CleanupResult> => {
  const ids = await findStaleGuests(db, now, max);
  const statements: DbStatement[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) statements.push(...deleteChunk(db, ids.slice(i, i + CHUNK)));
  // One batch is one transaction: a base is never deleted without its account, or the reverse.
  if (statements.length > 0) await db.batch(statements);
  return { guests: ids.length, rateWindows: await deleteOldGuestRate(db, now) };
};
