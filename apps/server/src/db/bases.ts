import { isBaseState, type BaseState } from "@revolt/rules";
import type { Db, DbStatement } from "./db.ts";

export interface StoredBase {
  readonly state: BaseState;
  readonly version: number;
}

export const insertBase = (db: Db, accountId: string, state: BaseState, now: number): DbStatement =>
  db
    .prepare("INSERT INTO bases (account_id, state, version, updated_at) VALUES (?, ?, 1, ?)")
    .bind(accountId, JSON.stringify(state), now);

export const loadBase = async (db: Db, accountId: string): Promise<StoredBase | null> => {
  const r = await db
    .prepare("SELECT state, version FROM bases WHERE account_id = ?")
    .bind(accountId)
    .first<{ state: string; version: number }>();
  if (r === null) return null;
  const state: unknown = JSON.parse(r.state);
  if (!isBaseState(state)) throw new Error(`corrupt base for ${accountId}`);
  return { state, version: r.version };
};

/** Compare-and-set on `version`. False if another write got there first. */
export const saveBase = async (db: Db, accountId: string, state: BaseState, expectedVersion: number, now: number): Promise<boolean> => {
  const r = await db
    .prepare("UPDATE bases SET state = ?, version = version + 1, updated_at = ? WHERE account_id = ? AND version = ?")
    .bind(JSON.stringify(state), now, accountId, expectedVersion)
    .run();
  return r.meta.changes === 1;
};
