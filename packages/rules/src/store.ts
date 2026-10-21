import { advance } from "./advance.ts";
import type { BaseState } from "./base-state.ts";
import { DAY_MS } from "./data/events.ts";
import { reduceJob } from "./help.ts";
import type { HelpKind } from "./help.ts";

export const STORE_BLOCK_REASONS = ["unknown_product", "already_owned", "daily_limit", "bad_receipt", "not_owned"] as const;
export type StoreBlockReason = (typeof STORE_BLOCK_REASONS)[number];

export const SPEEDUP_BLOCK_REASONS = ["bad_amount", "too_few_tokens", "no_speedup_job", "hq_job", "daily_cap"] as const;
export type SpeedUpBlockReason = (typeof SPEEDUP_BLOCK_REASONS)[number];

/** Time one speed-up token takes off a running job. */
export const SPEEDUP_TOKEN_MS = 15 * 60_000;
/** Most job time paid speed-ups (tokens, however earned or bought) may remove per UTC day (GDD §8: a power cap). */
export const SPEEDUP_DAILY_CAP_MS = 4 * 60 * 60_000;
/** Tokens one use may spend. */
export const SPEEDUP_MAX_PER_USE = 20;
/** Tokens an account holds at most. */
export const MAX_SPEEDUP_TOKENS_HELD = 999;

/** The UTC day number of `now`. */
export const utcDay = (now: number): number => Math.floor(now / DAY_MS);

/**
 * Speed-up time already used today. A stored day in the past resets; a stored day that is in the FUTURE
 * (the clock went backwards) keeps its usage, so rewinding the clock cannot open a fresh allowance.
 */
export const usedToday = (storedDay: number, storedMs: number, now: number): number => (storedDay >= utcDay(now) ? Math.max(0, storedMs) : 0);

export type SpeedUpResult =
  | { readonly ok: true; readonly state: BaseState; readonly appliedMs: number; readonly tokensUsed: number }
  | { readonly ok: false; readonly reason: SpeedUpBlockReason; readonly state: BaseState };

/**
 * Spends tokens on the running upgrade or training. Never removes the headquarters' own upgrade time, which is the
 * progression gate everything else hangs on (GDD §8); never removes more than the day's allowance; never takes a job
 * before `now` or before time already settled (`reduceJob`). Tokens are charged for the time actually removed.
 */
export const speedUp = (state: BaseState, job: HelpKind, tokens: number, held: number, usedTodayMs: number, now: number): SpeedUpResult => {
  const s = advance(state, now);
  if (!Number.isInteger(tokens) || tokens < 1 || tokens > SPEEDUP_MAX_PER_USE) return { ok: false, reason: "bad_amount", state: s };
  if (held < tokens) return { ok: false, reason: "too_few_tokens", state: s };
  const running = job === "upgrade" ? s.queue : s.training;
  if (running === null || running.endsAt <= now) return { ok: false, reason: "no_speedup_job", state: s };
  if (job === "upgrade" && s.queue?.building === "hq") return { ok: false, reason: "hq_job", state: s };
  const allowance = SPEEDUP_DAILY_CAP_MS - usedTodayMs;
  if (!(allowance > 0)) return { ok: false, reason: "daily_cap", state: s };
  const wanted = Math.min(tokens * SPEEDUP_TOKEN_MS, allowance);
  const r = reduceJob(s, job, wanted, now);
  if (!r.changed) return { ok: false, reason: "no_speedup_job", state: s };
  const after = job === "upgrade" ? r.state.queue : r.state.training;
  const appliedMs = running.endsAt - (after?.endsAt ?? running.endsAt);
  return { ok: true, state: r.state, appliedMs, tokensUsed: Math.min(tokens, Math.ceil(appliedMs / SPEEDUP_TOKEN_MS)) };
};
