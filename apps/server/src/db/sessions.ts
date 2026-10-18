import { hashToken } from "../auth/tokens.ts";
import type { Db, DbStatement } from "./db.ts";

export const insertSession = async (db: Db, token: string, accountId: string, now: number): Promise<DbStatement> =>
  db
    .prepare("INSERT INTO sessions (token_hash, account_id, created_at, last_used_at) VALUES (?, ?, ?, ?)")
    .bind(await hashToken(token), accountId, now, now);

export const accountIdForToken = async (db: Db, token: string): Promise<string | null> => {
  const r = await db
    .prepare("SELECT account_id FROM sessions WHERE token_hash = ?")
    .bind(await hashToken(token))
    .first<{ account_id: string }>();
  return r?.account_id ?? null;
};
