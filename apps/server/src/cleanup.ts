import type { Db, DbStatement } from "./db/db.ts";
import { deleteOldGuestRate } from "./db/guest-rate.ts";
import { dropOldRequests } from "./db/help.ts";

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

/** The ids that are still unreachable when the batch runs, as a subselect. Every delete below is limited to these. */
const guardedIds = (ids: string[]): string => `SELECT id FROM accounts WHERE id IN (${ids.map(() => "?").join(", ")}) AND ${UNREACHABLE}`;

const deleteChunk = (db: Db, ids: string[]): DbStatement[] => {
  const guarded = guardedIds(ids);
  const inGuarded = (table: string, column: string): DbStatement => db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${guarded})`).bind(...ids);
  return [
    // Help they gave or asked for, then their place in the alliance (before the account, which they reference).
    db.prepare(`DELETE FROM help_given WHERE helper_id IN (${guarded})`).bind(...ids),
    db.prepare(`DELETE FROM help_given WHERE request_id IN (SELECT id FROM help_requests WHERE account_id IN (${guarded}))`).bind(...ids),
    inGuarded("help_requests", "account_id"),
    inGuarded("alliance_members", "account_id"),
    inGuarded("reports", "account_id"),
    inGuarded("bases", "account_id"),
    inGuarded("accounts", "id"),
  ];
};

interface MemberRow {
  readonly account_id: string;
  readonly alliance_id: string;
  readonly rank: string;
  readonly joined_at: number;
}

/**
 * What deleting these accounts does to their alliances: the alliances left empty (they end), and for each alliance
 * whose leader is going, the member who takes over (the oldest officer, else the oldest member), so no alliance is
 * ever left without a leader.
 */
const planAlliances = async (db: Db, ids: string[]): Promise<{ ended: string[]; successors: { allianceId: string; leaderId: string; successorId: string }[] }> => {
  const gone = new Set(ids);
  const affected = new Set<string>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const r = await db
      .prepare(`SELECT alliance_id FROM alliance_members WHERE account_id IN (${chunk.map(() => "?").join(", ")})`)
      .bind(...chunk)
      .all<{ alliance_id: string }>();
    for (const row of r.results) affected.add(row.alliance_id);
  }
  const ended: string[] = [];
  const successors: { allianceId: string; leaderId: string; successorId: string }[] = [];
  for (const allianceId of affected) {
    const all = (
      await db
        .prepare("SELECT account_id, alliance_id, rank, joined_at FROM alliance_members WHERE alliance_id = ? ORDER BY joined_at, account_id")
        .bind(allianceId)
        .all<MemberRow>()
    ).results;
    const staying = all.filter((m) => !gone.has(m.account_id));
    if (staying.length === 0) {
      ended.push(allianceId);
      continue;
    }
    const leader = all.find((m) => m.rank === "leader");
    if (leader !== undefined && gone.has(leader.account_id)) {
      const next = staying.find((m) => m.rank === "officer") ?? staying[0];
      if (next !== undefined) successors.push({ allianceId, leaderId: leader.account_id, successorId: next.account_id });
    }
  }
  return { ended, successors };
};

export interface CleanupResult {
  readonly guests: number;
  readonly rateWindows: number;
  readonly helpRequests: number;
}

/**
 * Called with the deleted accounts of each server, and the alliances that end with them, BEFORE any D1 row is
 * deleted: the map and chat rooms are cleaned first (idempotent), so a failure leaves rows that the next run retries
 * rather than camps with no owner.
 */
export type OnDeleted = (server: string, ids: string[], endedAlliances: string[]) => Promise<void>;

/**
 * The daily job: deletes stale guest accounts with their bases, reports, help and alliance places (handing a leader's
 * alliance to a successor, or ending an emptied one), and expired rate-limit counters and old help requests.
 */
export const runCleanup = async (db: Db, now: number, max = CLEANUP_MAX_ACCOUNTS, onDeleted?: OnDeleted): Promise<CleanupResult> => {
  const stale = await findStaleGuests(db, now, max);
  const ids = stale.map((s) => s.id);
  if (ids.length > 0) {
    const plan = await planAlliances(db, ids);
    if (onDeleted !== undefined) {
      const byServer = new Map<string, string[]>();
      for (const s of stale) byServer.set(s.server, [...(byServer.get(s.server) ?? []), s.id]);
      for (const [server, list] of byServer) await onDeleted(server, list, plan.ended);
    }
    const statements: DbStatement[] = [];
    // A new leader first (the old one is still in the table, so this is guarded by the old one being deleted below).
    for (const s of plan.successors) {
      const guarded = guardedIds([s.leaderId]);
      statements.push(
        db
          .prepare(`UPDATE alliance_members SET rank = 'leader' WHERE account_id = ? AND alliance_id = ? AND EXISTS (SELECT 1 FROM (${guarded}))`)
          .bind(s.successorId, s.allianceId, s.leaderId),
      );
    }
    for (let i = 0; i < ids.length; i += CHUNK) statements.push(...deleteChunk(db, ids.slice(i, i + CHUNK)));
    for (const allianceId of plan.ended) {
      statements.push(db.prepare("DELETE FROM alliances WHERE id = ? AND NOT EXISTS (SELECT 1 FROM alliance_members WHERE alliance_id = ?)").bind(allianceId, allianceId));
    }
    // One batch is one transaction: a base is never deleted without its account, or the reverse.
    await db.batch(statements);
  }
  return { guests: ids.length, rateWindows: await deleteOldGuestRate(db, now), helpRequests: await dropOldRequests(db, now) };
};
