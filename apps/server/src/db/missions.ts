import {
  dailyClaimKey,
  DAILY_MISSION_IDS,
  metricKey,
  MISSION_METRICS,
  QUEST_IDS,
  questClaimKey,
  type DailyMissionId,
  type MissionMetric,
  type MissionTick,
  type QuestId,
} from "@revolt/rules";
import type { Db, DbStatement } from "./db.ts";

/** The row for one counted action, as a statement for a batch. INSERT OR IGNORE: an action counts once. */
export const tickStatement = (db: Db, accountId: string, tick: MissionTick, at: number): DbStatement =>
  db.prepare("INSERT OR IGNORE INTO mission_ticks (account_id, source, key, points, at) VALUES (?, ?, ?, ?, ?)").bind(accountId, tick.source, tick.key, tick.points, at);

/** Writes ticks outside any batch. Used after a save that already succeeded; a lost tick only undercounts a mission. */
export const writeTicks = async (db: Db, accountId: string, ticks: readonly (MissionTick | null)[], at: number): Promise<void> => {
  const stmts = ticks.flatMap((t) => (t === null ? [] : [tickStatement(db, accountId, t, at)]));
  if (stmts.length > 0) await db.batch(stmts);
};

/** One day's sums per metric. */
export const daySums = async (db: Db, accountId: string, day: number): Promise<Partial<Record<MissionMetric, number>>> => {
  const keys = MISSION_METRICS.map((m) => metricKey(day, m));
  const rows = await db
    .prepare(`SELECT key, SUM(points) AS s FROM mission_ticks WHERE account_id = ? AND key IN (${keys.map(() => "?").join(", ")}) GROUP BY key`)
    .bind(accountId, ...keys)
    .all<{ key: string; s: number }>();
  const sums: Partial<Record<MissionMetric, number>> = {};
  for (const m of MISSION_METRICS) {
    const row = rows.results.find((r) => r.key === metricKey(day, m));
    if (row !== undefined) sums[m] = row.s;
  }
  return sums;
};

const grantedKeys = async (db: Db, accountId: string, keys: readonly string[]): Promise<Set<string>> => {
  const rows = await db
    .prepare(`SELECT key FROM claims WHERE account_id = ? AND granted = 1 AND key IN (${keys.map(() => "?").join(", ")})`)
    .bind(accountId, ...keys)
    .all<{ key: string }>();
  return new Set(rows.results.map((r) => r.key));
};

export const claimedDaily = async (db: Db, accountId: string, day: number): Promise<Set<DailyMissionId>> => {
  const done = await grantedKeys(db, accountId, DAILY_MISSION_IDS.map((id) => dailyClaimKey(day, id)));
  return new Set(DAILY_MISSION_IDS.filter((id) => done.has(dailyClaimKey(day, id))));
};

export const claimedQuests = async (db: Db, accountId: string): Promise<Set<QuestId>> => {
  const done = await grantedKeys(db, accountId, QUEST_IDS.map(questClaimKey));
  return new Set(QUEST_IDS.filter((id) => done.has(questClaimKey(id))));
};
