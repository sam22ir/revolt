import type { BackgroundId } from "./background.ts";
import type { MarchResult } from "./base-state.ts";
import { EVENT_CLAIM_GRACE_MS, EVENT_IDS, EVENTS, isEventId, type EventId } from "./data/events.ts";
import { PASS_ANCHOR, PASS_SEASON_MS } from "./data/battle-pass.ts";
import type { Reward } from "./reward.ts";

export const EVENT_BLOCK_REASONS = ["unknown_event", "not_ended", "claim_expired", "no_reward", "already_claimed"] as const;
export type EventBlockReason = (typeof EVENT_BLOCK_REASONS)[number];

/** One occurrence of an event. Everything is a function of the clock and the calendar in the data table. */
export interface EventWindow {
  readonly id: EventId;
  readonly index: number;
  readonly startsAt: number;
  readonly endsAt: number;
  /** `id:index`, the stable name of this occurrence in scores and claims. */
  readonly key: string;
}

export const eventKey = (id: EventId, index: number): string => `${id}:${index}`;

export const parseEventKey = (key: unknown): { id: EventId; index: number } | null => {
  if (typeof key !== "string") return null;
  const m = /^([a-z_]+):(\d{1,6})$/.exec(key);
  const id = m?.[1];
  return m !== null && isEventId(id) ? { id, index: Number(m[2]) } : null;
};

export const eventWindow = (id: EventId, index: number): EventWindow => {
  const def = EVENTS[id];
  const startsAt = def.anchor + index * def.periodMs;
  return { id, index, startsAt, endsAt: startsAt + def.durationMs, key: eventKey(id, index) };
};

export const eventsFor = (background: BackgroundId): EventId[] => EVENT_IDS.filter((id) => EVENTS[id].backgrounds.includes(background));

/** The window of `id` that contains `now`, or null (before the first window, or between two windows). */
const openWindow = (id: EventId, now: number): EventWindow | null => {
  const def = EVENTS[id];
  if (!(now >= def.anchor)) return null;
  const w = eventWindow(id, Math.floor((now - def.anchor) / def.periodMs));
  return now < w.endsAt ? w : null;
};

/** Events running at `now` on this background's server. */
export const activeEvents = (now: number, background: BackgroundId): EventWindow[] =>
  eventsFor(background).flatMap((id) => openWindow(id, now) ?? []);

/** The latest window of `id` that has ended by `now`, or null. */
const lastEnded = (id: EventId, now: number): EventWindow | null => {
  const def = EVENTS[id];
  if (!(now >= def.anchor)) return null;
  const cur = Math.floor((now - def.anchor) / def.periodMs);
  const w = eventWindow(id, cur);
  if (now >= w.endsAt) return w;
  return cur > 0 ? eventWindow(id, cur - 1) : null;
};

/** Windows that ended recently enough that their rewards can still be claimed. */
export const claimableWindows = (now: number, background: BackgroundId): EventWindow[] =>
  eventsFor(background).flatMap((id) => {
    const w = lastEnded(id, now);
    return w !== null && now < w.endsAt + EVENT_CLAIM_GRACE_MS ? [w] : [];
  });

/** Index of the highest reward tier `score` reaches, or -1. */
export const eventRewardTier = (id: EventId, score: number): number => {
  const tiers = EVENTS[id].tiers;
  let best = -1;
  tiers.forEach((t, i) => {
    if (score >= t.score) best = i;
  });
  return best;
};

export const eventReward = (id: EventId, score: number): Reward | null => EVENTS[id].tiers[eventRewardTier(id, score)]?.reward ?? null;

/** Points one march earns an event: victories only, by target level, with a bonus for losing nobody. */
export const eventScoreFor = (id: EventId, result: MarchResult, npcLevel: number, troopsLost: number): number => {
  if (result !== "victory" || !(npcLevel >= 1)) return 0;
  const def = EVENTS[id];
  return Math.floor(npcLevel) * def.pointsPerLevel + (troopsLost === 0 ? def.cleanBonus : 0);
};

// --- Battle pass seasons and the awards a march writes -------------------------------------------------------

/** The pass season containing `now` (season 0 starts at the anchor; earlier times count as season 0). */
export const passSeasonAt = (now: number): { index: number; startsAt: number; endsAt: number } => {
  const index = Math.max(0, Math.floor((now - PASS_ANCHOR) / PASS_SEASON_MS));
  const startsAt = PASS_ANCHOR + index * PASS_SEASON_MS;
  return { index, startsAt, endsAt: startsAt + PASS_SEASON_MS };
};

export const passKey = (season: number): string => `pass:${season}`;

/** Pass XP for one march: a victory pays by target level, anything else a little for taking part. */
export const passXpFor = (result: MarchResult, npcLevel: number): number => (result === "victory" ? 20 + 5 * Math.max(1, Math.floor(npcLevel)) : result === "defeat" ? 5 : 0);

export interface Award {
  /** An event key (`supply_route:3`) or a pass key (`pass:0`). */
  readonly key: string;
  readonly points: number;
}

/**
 * Everything one march earns, at the time it arrived. The server writes each award once per (march, key), so a
 * retried delivery cannot count twice. Scores and pass XP are the sums of these awards; they are not counters.
 */
export const marchAwards = (background: BackgroundId, at: number, result: MarchResult, npcLevel: number, troopsLost: number): Award[] => {
  const awards: Award[] = [];
  for (const w of activeEvents(at, background)) {
    const points = eventScoreFor(w.id, result, npcLevel, troopsLost);
    if (points > 0) awards.push({ key: w.key, points });
  }
  const xp = passXpFor(result, npcLevel);
  if (xp > 0) awards.push({ key: passKey(passSeasonAt(at).index), points: xp });
  return awards;
};
