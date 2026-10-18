import type { JWTVerifyGetKey } from "jose";
import type { Db } from "./db/db.ts";

/** Bindings and vars from wrangler config. */
export interface Env {
  readonly DB: Db;
  /** Comma-separated Google OAuth client IDs accepted as `aud` (the web client ID). Empty disables Google. */
  readonly GOOGLE_CLIENT_IDS: string;
  /** Comma-separated origins allowed by CORS. */
  readonly ALLOWED_ORIGINS: string;
}

/** Things the entry module decides: the clock and where Google's signing keys come from. */
export interface Deps {
  readonly now: () => number;
  readonly googleKeys: JWTVerifyGetKey;
}

export const csv = (v: string): string[] =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
