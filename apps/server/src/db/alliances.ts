import {
  MAX_ALLIANCE_MEMBERS,
  nameKey,
  type AllianceBlockReason,
  type AllianceListItem,
  type AllianceMemberView,
  type AllianceRank,
  type AllianceView,
} from "@revolt/rules";
import { isUniqueViolation, type Db, type DbStatement } from "./db.ts";

export interface Membership {
  readonly allianceId: string;
  readonly allianceName: string;
  readonly allianceTag: string;
  readonly rank: AllianceRank;
  readonly joinedAt: number;
}

interface MembershipRow {
  readonly alliance_id: string;
  readonly name: string;
  readonly tag: string;
  readonly rank: AllianceRank;
  readonly joined_at: number;
}

/** Whether the account is (still) a member of this alliance. */
export const isMemberOf = async (db: Db, accountId: string, allianceId: string): Promise<boolean> =>
  (await db.prepare("SELECT 1 AS x FROM alliance_members WHERE account_id = ? AND alliance_id = ?").bind(accountId, allianceId).first()) !== null;

/** The alliance an account belongs to, if any. */
export const findMembership = async (db: Db, accountId: string): Promise<Membership | null> => {
  const r = await db
    .prepare(
      `SELECT m.alliance_id, a.name, a.tag, m.rank, m.joined_at FROM alliance_members m
       JOIN alliances a ON a.id = m.alliance_id WHERE m.account_id = ?`,
    )
    .bind(accountId)
    .first<MembershipRow>();
  return r === null ? null : { allianceId: r.alliance_id, allianceName: r.name, allianceTag: r.tag, rank: r.rank, joinedAt: r.joined_at };
};

const RANK_SORT = "CASE m.rank WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END";

/** The alliance as one of its members sees it. Handles only: no account id leaves this function. */
export const loadAllianceView = async (db: Db, m: Membership, viewerId: string, hq: { x: number; y: number } | null): Promise<AllianceView> => {
  const rows = await db
    .prepare(
      `SELECT m.account_id, m.rank, m.joined_at, a.handle FROM alliance_members m JOIN accounts a ON a.id = m.account_id
       WHERE m.alliance_id = ? ORDER BY ${RANK_SORT}, m.joined_at, a.handle`,
    )
    .bind(m.allianceId)
    .all<{ account_id: string; rank: AllianceRank; joined_at: number; handle: string }>();
  const members: AllianceMemberView[] = rows.results.map((r) => ({ handle: r.handle, rank: r.rank, joinedAt: r.joined_at, me: r.account_id === viewerId }));
  return { id: m.allianceId, name: m.allianceName, tag: m.allianceTag, myRank: m.rank, members, maxMembers: MAX_ALLIANCE_MEMBERS, hq };
};

/** Escapes LIKE wildcards so a search for "50%" means the characters, not a pattern. */
const likePrefix = (q: string): string => `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export const SEARCH_LIMIT = 20;

/** Alliances on a server whose name starts with `q` (case-insensitive for ASCII), biggest first. */
export const searchAlliances = async (db: Db, server: string, q: string): Promise<AllianceListItem[]> => {
  const r = await db
    .prepare(
      `SELECT a.id, a.name, a.tag, (SELECT COUNT(*) FROM alliance_members m WHERE m.alliance_id = a.id) AS members
       FROM alliances a WHERE a.server = ? AND a.name_key LIKE ? ESCAPE '\\' ORDER BY members DESC, a.name_key LIMIT ?`,
    )
    .bind(server, likePrefix(nameKey(q)), SEARCH_LIMIT)
    .all<{ id: string; name: string; tag: string; members: number }>();
  return r.results.map((x) => ({ ...x, maxMembers: MAX_ALLIANCE_MEMBERS }));
};

export type CreateResult = { readonly ok: true } | { readonly ok: false; readonly reason: "name_taken" | "tag_taken" | "already_member" };

/** Creates an alliance with its founder as leader, in one batch. The unique indexes decide name and tag races. */
export const createAlliance = async (
  db: Db,
  a: { id: string; server: string; name: string; tag: string; founderId: string; now: number },
): Promise<CreateResult> => {
  try {
    await db.batch([
      db.prepare("INSERT INTO alliances (id, server, name, name_key, tag, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(a.id, a.server, a.name, nameKey(a.name), a.tag, a.now),
      db.prepare("INSERT INTO alliance_members (account_id, alliance_id, rank, joined_at) VALUES (?, ?, 'leader', ?)").bind(a.founderId, a.id, a.now),
    ]);
    return { ok: true };
  } catch (e) {
    if (!isUniqueViolation(e) || !(e instanceof Error)) throw e;
    if (/alliance_members/i.test(e.message)) return { ok: false, reason: "already_member" };
    if (/tag/i.test(e.message)) return { ok: false, reason: "tag_taken" };
    return { ok: false, reason: "name_taken" };
  }
};

/** The alliance on `server` with this id, or null. */
export const allianceExists = async (db: Db, id: string, server: string): Promise<boolean> =>
  (await db.prepare("SELECT 1 AS x FROM alliances WHERE id = ? AND server = ?").bind(id, server).first()) !== null;

/** Joins as a member unless the alliance is full or gone: one guarded statement, so the cap cannot be raced. */
export const joinAlliance = async (db: Db, accountId: string, allianceId: string, server: string, now: number): Promise<{ ok: true } | { ok: false; reason: AllianceBlockReason }> => {
  try {
    const r = await db
      .prepare(
        `INSERT INTO alliance_members (account_id, alliance_id, rank, joined_at)
         SELECT ?, ?, 'member', ? WHERE EXISTS (SELECT 1 FROM alliances WHERE id = ? AND server = ?)
           AND (SELECT COUNT(*) FROM alliance_members WHERE alliance_id = ?) < ?`,
      )
      .bind(accountId, allianceId, now, allianceId, server, allianceId, MAX_ALLIANCE_MEMBERS)
      .run();
    if (r.meta.changes === 1) return { ok: true };
    return { ok: false, reason: (await allianceExists(db, allianceId, server)) ? "alliance_full" : "alliance_gone" };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: "already_member" };
    throw e;
  }
};

/** Statements that remove everything an account left in an alliance: its help requests and the help it gave. */
const dropHelp = (db: Db, accountId: string): DbStatement[] => [
  db.prepare("DELETE FROM help_given WHERE helper_id = ? AND NOT EXISTS (SELECT 1 FROM alliance_members WHERE account_id = ?)").bind(accountId, accountId),
  db
    .prepare("DELETE FROM help_given WHERE request_id IN (SELECT id FROM help_requests WHERE account_id = ?) AND NOT EXISTS (SELECT 1 FROM alliance_members WHERE account_id = ?)")
    .bind(accountId, accountId),
  db.prepare("DELETE FROM help_requests WHERE account_id = ? AND NOT EXISTS (SELECT 1 FROM alliance_members WHERE account_id = ?)").bind(accountId, accountId),
];

/** Removes an emptied alliance. A no-op while anyone is still in it. */
const dropIfEmpty = (db: Db, allianceId: string): DbStatement =>
  db.prepare("DELETE FROM alliances WHERE id = ? AND NOT EXISTS (SELECT 1 FROM alliance_members WHERE alliance_id = ?)").bind(allianceId, allianceId);

/**
 * Leaves the alliance. A leader may leave only as its last member (which ends the alliance): the guard is in the
 * statement, so a member joining at the same moment cannot be orphaned. `disbanded` says the alliance is gone.
 */
export const leaveAlliance = async (db: Db, accountId: string, allianceId: string): Promise<{ ok: true; disbanded: boolean } | { ok: false; reason: "leader_must_transfer" | "not_member" }> => {
  const [left] = (await db.batch([
    db
      .prepare(
        `DELETE FROM alliance_members WHERE account_id = ? AND alliance_id = ?
           AND (rank != 'leader' OR (SELECT COUNT(*) FROM alliance_members WHERE alliance_id = ?) = 1)`,
      )
      .bind(accountId, allianceId, allianceId),
    ...dropHelp(db, accountId),
    dropIfEmpty(db, allianceId),
  ])) as { meta: { changes: number } }[];
  if (left?.meta.changes === 1) return { ok: true, disbanded: !(await stillThere(db, allianceId)) };
  const m = await db.prepare("SELECT rank FROM alliance_members WHERE account_id = ? AND alliance_id = ?").bind(accountId, allianceId).first<{ rank: string }>();
  return { ok: false, reason: m === null ? "not_member" : "leader_must_transfer" };
};

const stillThere = async (db: Db, allianceId: string): Promise<boolean> =>
  (await db.prepare("SELECT 1 AS x FROM alliances WHERE id = ?").bind(allianceId).first()) !== null;

interface Target {
  readonly accountId: string;
  readonly rank: AllianceRank;
}

/** A member of the alliance by handle (handles are unique per server, so this is never ambiguous). */
export const findMemberByHandle = async (db: Db, allianceId: string, handle: string): Promise<Target | null> => {
  const r = await db
    .prepare("SELECT m.account_id, m.rank FROM alliance_members m JOIN accounts a ON a.id = m.account_id WHERE m.alliance_id = ? AND a.handle = ?")
    .bind(allianceId, handle)
    .first<{ account_id: string; rank: AllianceRank }>();
  return r === null ? null : { accountId: r.account_id, rank: r.rank };
};

/**
 * Removes a member. The ranks are re-checked inside the statement (the actor is still leader or officer, the target is
 * still strictly lower), so a rank change between the check and the write cannot let a kick through. True if removed.
 */
export const kickMember = async (db: Db, actorId: string, targetId: string, allianceId: string): Promise<boolean> => {
  const [r] = (await db.batch([
    db
      .prepare(
        `DELETE FROM alliance_members WHERE account_id = ? AND alliance_id = ? AND rank != 'leader'
           AND EXISTS (SELECT 1 FROM alliance_members a WHERE a.account_id = ? AND a.alliance_id = ?
                       AND (a.rank = 'leader' OR (a.rank = 'officer' AND alliance_members.rank = 'member')))`,
      )
      .bind(targetId, allianceId, actorId, allianceId),
    ...dropHelp(db, targetId),
  ])) as { meta: { changes: number } }[];
  return r?.meta.changes === 1;
};

/** Promotes a member to officer, only while the actor is still the leader. */
export const promoteMember = async (db: Db, leaderId: string, targetId: string, allianceId: string): Promise<boolean> => {
  const r = await db
    .prepare(
      `UPDATE alliance_members SET rank = 'officer' WHERE account_id = ? AND alliance_id = ? AND rank = 'member'
         AND EXISTS (SELECT 1 FROM alliance_members l WHERE l.account_id = ? AND l.alliance_id = ? AND l.rank = 'leader')`,
    )
    .bind(targetId, allianceId, leaderId, allianceId)
    .run();
  return r.meta.changes === 1;
};

/** Demotes an officer to member, only while the actor is still the leader. */
export const demoteMember = async (db: Db, leaderId: string, targetId: string, allianceId: string): Promise<boolean> => {
  const r = await db
    .prepare(
      `UPDATE alliance_members SET rank = 'member' WHERE account_id = ? AND alliance_id = ? AND rank = 'officer'
         AND EXISTS (SELECT 1 FROM alliance_members l WHERE l.account_id = ? AND l.alliance_id = ? AND l.rank = 'leader')`,
    )
    .bind(targetId, allianceId, leaderId, allianceId)
    .run();
  return r.meta.changes === 1;
};

/**
 * Hands leadership to another member; the old leader becomes an officer. Both rows change or neither does: the
 * second statement depends on the first one's effect (the target is now leader), and a final assertion rolls the
 * batch back if either did not apply. True if transferred.
 */
export const transferLeadership = async (db: Db, leaderId: string, targetId: string, allianceId: string): Promise<boolean> => {
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE alliance_members SET rank = 'leader' WHERE account_id = ? AND alliance_id = ? AND rank != 'leader' AND account_id != ?
             AND EXISTS (SELECT 1 FROM alliance_members l WHERE l.account_id = ? AND l.alliance_id = ? AND l.rank = 'leader')`,
        )
        .bind(targetId, allianceId, leaderId, leaderId, allianceId),
      db
        .prepare(
          `UPDATE alliance_members SET rank = 'officer' WHERE account_id = ? AND alliance_id = ? AND rank = 'leader'
             AND EXISTS (SELECT 1 FROM alliance_members t WHERE t.account_id = ? AND t.alliance_id = ? AND t.rank = 'leader')`,
        )
        .bind(leaderId, allianceId, targetId, allianceId),
      // A row is written only on failure (the CHECK then rolls the batch back); `IS NOT 1` counts NULL as failure too.
      db
        .prepare(
          `INSERT INTO batch_assert (ok) SELECT 0 WHERE
             ((SELECT rank FROM alliance_members WHERE account_id = ?) = 'leader' AND (SELECT rank FROM alliance_members WHERE account_id = ?) = 'officer') IS NOT 1`,
        )
        .bind(targetId, leaderId),
    ]);
    return true;
  } catch (e) {
    if (e instanceof Error && /CHECK constraint failed/i.test(e.message)) return false;
    throw e;
  }
};

/** Ids of the alliance's members. */
export const memberIds = async (db: Db, allianceId: string): Promise<string[]> => {
  const r = await db.prepare("SELECT account_id FROM alliance_members WHERE alliance_id = ?").bind(allianceId).all<{ account_id: string }>();
  return r.results.map((x) => x.account_id);
};
