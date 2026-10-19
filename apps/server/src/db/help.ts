import { MAX_HELPS_PER_REQUEST, type HelpKind, type HelpRequestView } from "@revolt/rules";
import type { Db } from "./db.ts";

export interface HelpRequestRow {
  readonly id: string;
  readonly accountId: string;
  readonly kind: HelpKind;
  readonly jobStartedAt: number;
  readonly endsAt: number;
  readonly helps: number;
  /** The alliance the requester is in now. */
  readonly allianceId: string;
}

interface Row {
  readonly id: string;
  readonly account_id: string;
  readonly kind: HelpKind;
  readonly job_started_at: number;
  readonly ends_at: number;
  readonly helps: number;
  readonly alliance_id: string;
}

/** A request with the alliance its requester belongs to now (a request of someone who left has none, so it is gone). */
export const findRequest = async (db: Db, id: string): Promise<HelpRequestRow | null> => {
  const r = await db
    .prepare(
      `SELECT r.id, r.account_id, r.kind, r.job_started_at, r.ends_at, r.helps, m.alliance_id FROM help_requests r
       JOIN alliance_members m ON m.account_id = r.account_id WHERE r.id = ?`,
    )
    .bind(id)
    .first<Row>();
  return r === null ? null : { id: r.id, accountId: r.account_id, kind: r.kind, jobStartedAt: r.job_started_at, endsAt: r.ends_at, helps: r.helps, allianceId: r.alliance_id };
};

/** Open requests (their job still running) of the alliance's members, oldest first. One query, no bases loaded. */
export const listOpenRequests = async (db: Db, allianceId: string, viewerId: string, now: number): Promise<HelpRequestView[]> => {
  const r = await db
    .prepare(
      `SELECT r.id, a.handle, r.kind, r.ends_at, r.helps, r.account_id,
              EXISTS (SELECT 1 FROM help_given g WHERE g.request_id = r.id AND g.helper_id = ?) AS helped
       FROM help_requests r JOIN alliance_members m ON m.account_id = r.account_id JOIN accounts a ON a.id = r.account_id
       WHERE m.alliance_id = ? AND r.ends_at > ? ORDER BY r.created_at, r.id`,
    )
    .bind(viewerId, allianceId, now)
    .all<{ id: string; handle: string; kind: HelpKind; ends_at: number; helps: number; account_id: string; helped: number }>();
  return r.results.map((x) => ({
    id: x.id,
    handle: x.handle,
    kind: x.kind,
    endsAt: x.ends_at,
    helps: x.helps,
    maxHelps: MAX_HELPS_PER_REQUEST,
    mine: x.account_id === viewerId,
    helped: x.helped === 1,
  }));
};

/** Requests whose job ended more than a day ago, with the help rows pointing at them. */
export const dropOldRequests = async (db: Db, now: number): Promise<number> => {
  const cutoff = now - 24 * 60 * 60_000;
  await db.prepare("DELETE FROM help_given WHERE request_id IN (SELECT id FROM help_requests WHERE ends_at < ?)").bind(cutoff).run();
  const r = await db.prepare("DELETE FROM help_requests WHERE ends_at < ?").bind(cutoff).run();
  return r.meta.changes;
};
