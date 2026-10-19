import { CHAT_HISTORY, CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS, validateChatText, type AllianceRank, type ChatMessage } from "@revolt/rules";
import type { MapSql } from "../map/map-sql.ts";

export type PostResult =
  | { readonly ok: true; readonly message: ChatMessage }
  | { readonly ok: false; readonly reason: "rate_limited" | "bad_text" };

/** Rows kept beyond what is sent as history, so a prune never races a joining client. */
const KEEP = CHAT_HISTORY * 2;

/**
 * One alliance's chat: the last messages, kept in the room's own SQLite storage (never in D1). Pure of sockets
 * and clocks: callers pass `now`. The rate limit is per account and in memory, which is enough to bound abuse:
 * a room that restarts forgets it for at most one window.
 */
export class ChatRoom {
  private readonly recent = new Map<string, number[]>();

  constructor(private readonly sql: MapSql) {
    sql.exec("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, handle TEXT NOT NULL, rank TEXT NOT NULL, text TEXT NOT NULL)");
  }

  /** The newest messages, oldest first. */
  history(): ChatMessage[] {
    return this.sql
      .exec<{ id: number; at: number; handle: string; rank: AllianceRank; text: string }>("SELECT id, at, handle, rank, text FROM messages ORDER BY id DESC LIMIT ?", CHAT_HISTORY)
      .reverse()
      .map((r) => ({ id: r.id, at: r.at, handle: r.handle, rank: r.rank, text: r.text }));
  }

  /** Validates, rate-limits and stores a message. `from` is the sender as the Worker authenticated them. */
  post(from: { readonly accountId: string; readonly handle: string; readonly rank: AllianceRank }, text: unknown, now: number): PostResult {
    const clean = validateChatText(text);
    if (clean === null) return { ok: false, reason: "bad_text" };
    const times = (this.recent.get(from.accountId) ?? []).filter((t) => now - t < CHAT_RATE_WINDOW_MS && t <= now);
    if (times.length >= CHAT_RATE_MAX) {
      this.recent.set(from.accountId, times);
      return { ok: false, reason: "rate_limited" };
    }
    this.recent.set(from.accountId, [...times, now]);
    const row = this.sql.exec<{ id: number }>("INSERT INTO messages (at, handle, rank, text) VALUES (?, ?, ?, ?) RETURNING id", now, from.handle, from.rank, clean)[0];
    if (row === undefined) throw new Error("chat insert returned no id");
    this.sql.exec("DELETE FROM messages WHERE id <= ?", row.id - KEEP);
    return { ok: true, message: { id: row.id, at: now, handle: from.handle, rank: from.rank, text: clean } };
  }

  /** Forgets everything (the alliance is gone). */
  clear(): void {
    this.sql.exec("DELETE FROM messages");
    this.recent.clear();
  }
}
