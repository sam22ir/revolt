import type { JWTVerifyGetKey } from "jose";
import type { Db } from "./db/db.ts";
import type { MapApi, MapNamespace } from "./map/map-client.ts";

/** Bindings and vars from wrangler config. */
export interface Env {
  readonly DB: Db;
  /** One WorldMap Durable Object per server map (GDD §5). */
  readonly WORLD_MAP: MapNamespace;
  /** Comma-separated Google OAuth client IDs accepted as `aud` (the web client ID). Empty disables Google. */
  readonly GOOGLE_CLIENT_IDS: string;
  /** Comma-separated origins allowed by CORS. */
  readonly ALLOWED_ORIGINS: string;
  /** Guest accounts one client IP (IPv6: /64) may create per hour. Unset or invalid: `DEFAULT_GUEST_LIMIT_PER_HOUR`. */
  readonly GUEST_LIMIT_PER_HOUR?: string;
}

export const DEFAULT_GUEST_LIMIT_PER_HOUR = 30;

export const guestLimitPerHour = (env: Env): number => {
  const n = Number(env.GUEST_LIMIT_PER_HOUR);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_GUEST_LIMIT_PER_HOUR;
};

/** Things the entry module decides: the clock, where Google's signing keys come from, and how to reach a map. */
export interface Deps {
  readonly now: () => number;
  readonly googleKeys: JWTVerifyGetKey;
  readonly map: (env: Env, server: string) => MapApi;
}

export const csv = (v: string): string[] =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
