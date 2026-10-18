import type { BattleReport } from "@revolt/rules";
import type { Db, DbStatement } from "./db.ts";

/** Reports returned by `GET /v1/reports`. */
export const REPORTS_PAGE = 20;

/** Writes a report once: a second write for the same march is ignored. */
export const insertReport = (db: Db, accountId: string, report: BattleReport): DbStatement =>
  db
    .prepare("INSERT OR IGNORE INTO reports (id, account_id, created_at, report) VALUES (?, ?, ?, ?)")
    .bind(report.id, accountId, report.at, JSON.stringify(report));

export const latestReports = async (db: Db, accountId: string): Promise<BattleReport[]> => {
  const r = await db
    .prepare("SELECT report FROM reports WHERE account_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
    .bind(accountId, REPORTS_PAGE)
    .all<{ report: string }>();
  return r.results.map((row) => JSON.parse(row.report) as BattleReport);
};
