import { hashToken } from "../auth/tokens.ts";
import type { Db, DbStatement } from "./db.ts";

/** `last_used_at` is refreshed at most this often, to keep D1 writes low. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export interface Session {
  readonly tokenHash: string;
  readonly accountId: string;
  readonly lastUsedAt: number;
}

export const insertSession = async (db: Db, token: string, accountId: string, now: number): Promise<DbStatement> =>
  db
    .prepare("INSERT INTO sessions (token_hash, account_id, created_at, last_used_at) VALUES (?, ?, ?, ?)")
    .bind(await hashToken(token), accountId, now, now);

export const findSession = async (db: Db, token: string): Promise<Session | null> => {
  const tokenHash = await hashToken(token);
  const r = await db
    .prepare("SELECT account_id, last_used_at FROM sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .first<{ account_id: string; last_used_at: number }>();
  return r === null ? null : { tokenHash, accountId: r.account_id, lastUsedAt: r.last_used_at };
};

/**
 * Moves `last_used_at` to `now` if it is at least an hour older. Never moves it
 * backwards, and concurrent requests write it at most once.
 */
export const touchSession = async (db: Db, s: Session, now: number): Promise<void> => {
  if (now - s.lastUsedAt < SESSION_TOUCH_INTERVAL_MS) return;
  await db
    .prepare("UPDATE sessions SET last_used_at = ? WHERE token_hash = ? AND last_used_at <= ?")
    .bind(now, s.tokenHash, now - SESSION_TOUCH_INTERVAL_MS)
    .run();
};

/** Ends a session, recording on its account when that happened (see `accounts.last_seen_at`). */
export const endSession = (db: Db, s: Session, now: number): DbStatement[] => [
  db.prepare("UPDATE accounts SET last_seen_at = MAX(COALESCE(last_seen_at, 0), ?) WHERE id = ?").bind(now, s.accountId),
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(s.tokenHash),
];
