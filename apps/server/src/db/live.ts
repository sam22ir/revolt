import {
  backgroundOfServer,
  COSMETIC_SLOT,
  EMPTY_PASS,
  MAX_SPEEDUP_TOKENS_HELD,
  marchAwards,
  passKey,
  passSeasonAt,
  slotOf,
  totalTroops,
  type BattleReport,
  type CosmeticId,
  type CosmeticSlot,
  type PassProgress,
} from "@revolt/rules";
import type { Db, DbStatement } from "./db.ts";

/** The award rows a battle report earns, as statements for the same batch as the report. INSERT OR IGNORE: written once. */
export const awardStatements = (db: Db, accountId: string, server: string, report: BattleReport): DbStatement[] => {
  let awards;
  try {
    awards = marchAwards(backgroundOfServer(server), report.at, report.result, report.target.level, totalTroops(report.lost));
  } catch {
    return []; // an unnamed server (a bare test map) earns nothing
  }
  return awards.map((a) =>
    db
      .prepare("INSERT OR IGNORE INTO live_awards (march_id, key, account_id, server, points, at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(report.id, a.key, accountId, server, a.points, report.at),
  );
};

export const eventScore = async (db: Db, accountId: string, key: string): Promise<number> => {
  const r = await db.prepare("SELECT COALESCE(SUM(points), 0) AS s FROM live_awards WHERE account_id = ? AND key = ?").bind(accountId, key).first<{ s: number }>();
  return r?.s ?? 0;
};

export const isClaimed = async (db: Db, accountId: string, key: string): Promise<boolean> => {
  const r = await db.prepare("SELECT granted FROM claims WHERE account_id = ? AND key = ?").bind(accountId, key).first<{ granted: number }>();
  return r?.granted === 1;
};

// --- Pass ------------------------------------------------------------------------------------------------------

export const loadPass = async (db: Db, accountId: string, now: number): Promise<{ season: number; progress: PassProgress }> => {
  const season = passSeasonAt(now).index;
  const xp = await db.prepare("SELECT COALESCE(SUM(points), 0) AS s FROM live_awards WHERE account_id = ? AND key = ?").bind(accountId, passKey(season)).first<{ s: number }>();
  const prem = await db.prepare("SELECT 1 AS x FROM pass_premium WHERE account_id = ? AND season = ?").bind(accountId, season).first();
  const claimed = await db
    .prepare("SELECT key FROM claims WHERE account_id = ? AND granted = 1 AND key LIKE ?")
    .bind(accountId, `pass:${season}:%`)
    .all<{ key: string }>();
  let claimedFree = 0;
  let claimedPremium = 0;
  for (const { key } of claimed.results) {
    const m = /^pass:\d+:(free|premium):(\d+)$/.exec(key);
    const tier = Number(m?.[2]);
    if (m === null || !(tier >= 1 && tier <= 30)) continue;
    if (m[1] === "free") claimedFree |= 1 << (tier - 1);
    else claimedPremium |= 1 << (tier - 1);
  }
  return { season, progress: { ...EMPTY_PASS, xp: xp?.s ?? 0, premium: prem !== null, claimedFree, claimedPremium } };
};

// --- Wallet ----------------------------------------------------------------------------------------------------

export interface Wallet {
  readonly tokens: number;
  readonly day: number;
  readonly usedMs: number;
}

export const loadWallet = async (db: Db, accountId: string): Promise<Wallet> => {
  const r = await db.prepare("SELECT speedup_tokens, speedup_day, speedup_used_ms FROM wallet WHERE account_id = ?").bind(accountId).first<{
    speedup_tokens: number;
    speedup_day: number;
    speedup_used_ms: number;
  }>();
  return r === null ? { tokens: 0, day: 0, usedMs: 0 } : { tokens: r.speedup_tokens, day: r.speedup_day, usedMs: r.speedup_used_ms };
};

/**
 * Takes tokens and records the day's use, as a statement for a batch: it changes a row only if the wallet is exactly as it
 * was read and the base is still at `baseVersion`, so it and the base save that follows it land together or not at all.
 */
export const reserveTokensStatement = (db: Db, accountId: string, w: Wallet, spend: number, day: number, usedMs: number, baseVersion: number): DbStatement =>
  db
    .prepare(
      `UPDATE wallet SET speedup_tokens = speedup_tokens - ?, speedup_day = ?, speedup_used_ms = ?
       WHERE account_id = ? AND speedup_tokens = ? AND speedup_day = ? AND speedup_used_ms = ?
       AND EXISTS (SELECT 1 FROM bases WHERE account_id = ? AND version = ?)`,
    )
    .bind(spend, day, usedMs, accountId, w.tokens, w.day, w.usedMs, accountId, baseVersion);

// --- Cosmetics -------------------------------------------------------------------------------------------------

export const loadCosmetics = async (db: Db, accountId: string): Promise<{ owned: CosmeticId[]; equipped: Partial<Record<CosmeticSlot, CosmeticId>> }> => {
  const r = await db.prepare("SELECT cosmetic, equipped FROM cosmetics WHERE account_id = ? ORDER BY cosmetic").bind(accountId).all<{ cosmetic: string; equipped: number }>();
  const owned: CosmeticId[] = [];
  const equipped: Partial<Record<CosmeticSlot, CosmeticId>> = {};
  for (const row of r.results) {
    if (!(row.cosmetic in COSMETIC_SLOT)) continue;
    const id = row.cosmetic as CosmeticId;
    owned.push(id);
    if (row.equipped === 1) equipped[slotOf(id)] = id;
  }
  return { owned, equipped };
};

/** Equips `id` (and unequips the rest of its slot), or empties `slot` when `id` is null. False: not owned. */
export const equipCosmetic = async (db: Db, accountId: string, slot: CosmeticSlot, id: CosmeticId | null): Promise<boolean> => {
  const inSlot = Object.keys(COSMETIC_SLOT).filter((c) => COSMETIC_SLOT[c] === slot);
  if (id !== null) {
    const has = await db.prepare("SELECT 1 AS x FROM cosmetics WHERE account_id = ? AND cosmetic = ?").bind(accountId, id).first();
    if (has === null) return false;
  }
  await db
    .prepare(`UPDATE cosmetics SET equipped = CASE WHEN cosmetic = ? THEN 1 ELSE 0 END WHERE account_id = ? AND cosmetic IN (${inSlot.map(() => "?").join(", ")})`)
    .bind(id ?? "", accountId, ...inSlot)
    .run();
  return true;
};

// --- Snapshots and boards --------------------------------------------------------------------------------------

/** Stores power and regions for the boards. Writes only when a value changed, so `updated_at` means "reached at". */
export const refreshSnapshot = (db: Db, accountId: string, server: string, power: number, regions: number, now: number): Promise<unknown> =>
  db
    .prepare(
      `INSERT INTO score_snapshots (account_id, server, power, regions, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (account_id) DO UPDATE SET server = excluded.server, power = excluded.power, regions = excluded.regions, updated_at = excluded.updated_at
       WHERE score_snapshots.power != excluded.power OR score_snapshots.regions != excluded.regions OR score_snapshots.server != excluded.server`,
    )
    .bind(accountId, server, power, regions, now)
    .run();

/** One ranked row: `id` is internal (an account or alliance id) and never leaves the server. */
export interface BoardRow {
  readonly id: string;
  readonly name: string;
  readonly score: number;
  readonly reached: number;
}

/** A board is a query yielding (id, name, score, reached) with its binds. Ranking is the same for every board. */
export interface BoardQuery {
  readonly inner: string;
  readonly binds: (string | number)[];
}

export const powerBoard = (server: string, column: "power" | "regions"): BoardQuery => ({
  inner: `SELECT s.account_id AS id, a.handle AS name, s.${column} AS score, s.updated_at AS reached
          FROM score_snapshots s JOIN accounts a ON a.id = s.account_id WHERE s.server = ? AND s.${column} > 0`,
  binds: [server],
});

export const eventBoard = (server: string, key: string): BoardQuery => ({
  inner: `SELECT l.account_id AS id, a.handle AS name, SUM(l.points) AS score, MAX(l.at) AS reached
          FROM live_awards l JOIN accounts a ON a.id = l.account_id WHERE l.key = ? AND l.server = ? GROUP BY l.account_id`,
  binds: [key, server],
});

export const allianceBoard = (server: string): BoardQuery => ({
  inner: `SELECT al.id AS id, al.name AS name, SUM(s.power) AS score, MAX(s.updated_at) AS reached
          FROM alliances al JOIN alliance_members m ON m.alliance_id = al.id JOIN score_snapshots s ON s.account_id = m.account_id
          WHERE al.server = ? GROUP BY al.id`,
  binds: [server],
});

const ORDER = "ORDER BY score DESC, reached ASC, name ASC";

export const topOfBoard = async (db: Db, q: BoardQuery, limit: number): Promise<BoardRow[]> =>
  (await db.prepare(`SELECT id, name, score, reached FROM (${q.inner}) ${ORDER} LIMIT ?`).bind(...q.binds, limit).all<BoardRow>()).results;

/** The row with this id and its 1-based rank by the same order as `topOfBoard`, or null if it has no row. */
export const placeOnBoard = async (db: Db, q: BoardQuery, id: string): Promise<{ row: BoardRow; rank: number } | null> => {
  const row = await db.prepare(`SELECT id, name, score, reached FROM (${q.inner}) WHERE id = ?`).bind(...q.binds, id).first<BoardRow>();
  if (row === null) return null;
  const ahead = await db
    .prepare(`SELECT COUNT(*) AS n FROM (${q.inner}) WHERE score > ? OR (score = ? AND (reached < ? OR (reached = ? AND name < ?)))`)
    .bind(...q.binds, row.score, row.score, row.reached, row.reached, row.name)
    .first<{ n: number }>();
  return { row, rank: (ahead?.n ?? 0) + 1 };
};
