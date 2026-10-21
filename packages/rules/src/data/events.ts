import type { BackgroundId } from "../background.ts";
import type { Reward } from "../reward.ts";

/**
 * Timed server-wide events (GDD §4.9). Names and descriptions are i18n keys `event.<id>.*`.
 * `vietnam_seasonal_placeholder` is a PLACEHOLDER id for the Vietnam seasonal campaign: its text is a draft and needs historian
 * review before it ships (GDD §6, docs/story-review.md). No event rewards violence against civilians; scoring is
 * only ever for beating colonial NPC armies and convoys on the map.
 */
export const EVENT_IDS = ["supply_route", "convoy_hunt", "seasonal_campaign", "vietnam_seasonal_placeholder"] as const;
export type EventId = (typeof EVENT_IDS)[number];

export const isEventId = (v: unknown): v is EventId => EVENT_IDS.some((id) => id === v);

export interface EventTier {
  /** Score needed. */
  readonly score: number;
  readonly reward: Reward;
}

export interface EventDef {
  /** Epoch ms of the first window's start. Window `i` starts at `anchor + i * periodMs`. */
  readonly anchor: number;
  readonly periodMs: number;
  /** How long each window is open; at most `periodMs`. */
  readonly durationMs: number;
  readonly backgrounds: readonly BackgroundId[];
  /** Points for a victory, per level of the NPC target. */
  readonly pointsPerLevel: number;
  /** Extra points for a victory that lost no troops. */
  readonly cleanBonus: number;
  /** Rewards by score, ascending. A player gets the highest tier reached. */
  readonly tiers: readonly EventTier[];
  /** True while the event's text and content still need historian review. */
  readonly needsReview: boolean;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
export const DAY_MS = 24 * HOUR;
/** A Monday, 00:00 UTC. */
export const LIVE_ANCHOR = Date.UTC(2026, 0, 5);

/** How long after a window ends its rewards can still be claimed. */
export const EVENT_CLAIM_GRACE_MS = 7 * DAY_MS;

const res = (food: number, materiel: number, funds: number): Reward["resources"] => ({ food, materiel, funds });

// Placeholder balance. Every reward here is earnable by free players; none is paid-only (GDD §8).
export const EVENTS: Readonly<Record<EventId, EventDef>> = {
  supply_route: {
    anchor: LIVE_ANCHOR,
    periodMs: 7 * DAY_MS,
    durationMs: 7 * DAY_MS,
    backgrounds: ["algeria", "vietnam"],
    pointsPerLevel: 10,
    cleanBonus: 5,
    needsReview: false,
    tiers: [
      { score: 50, reward: { resources: res(300, 300, 300) } },
      { score: 200, reward: { resources: res(800, 800, 800), speedupTokens: 2 } },
      { score: 600, reward: { resources: res(1500, 1500, 1500), shards: 4, speedupTokens: 3 } },
    ],
  },
  convoy_hunt: {
    anchor: LIVE_ANCHOR,
    periodMs: 3 * DAY_MS,
    durationMs: 2 * DAY_MS,
    backgrounds: ["algeria", "vietnam"],
    pointsPerLevel: 15,
    cleanBonus: 5,
    needsReview: false,
    tiers: [
      { score: 40, reward: { resources: res(200, 200, 200) } },
      { score: 150, reward: { resources: res(600, 600, 600), speedupTokens: 1 } },
      { score: 400, reward: { shards: 3, speedupTokens: 2, cosmetic: "outfit_scarf" } },
    ],
  },
  seasonal_campaign: {
    anchor: LIVE_ANCHOR,
    periodMs: 28 * DAY_MS,
    durationMs: 21 * DAY_MS,
    backgrounds: ["algeria"],
    pointsPerLevel: 12,
    cleanBonus: 6,
    needsReview: true,
    tiers: [
      { score: 100, reward: { resources: res(500, 500, 500) } },
      { score: 500, reward: { resources: res(1500, 1500, 1500), shards: 4, speedupTokens: 3 } },
      { score: 1500, reward: { shards: 8, speedupTokens: 5, cosmetic: "skin_sand" } },
    ],
  },
  // PLACEHOLDER: needs historian review. Same shape as the Algerian campaign so the pipeline can be tested.
  vietnam_seasonal_placeholder: {
    anchor: LIVE_ANCHOR,
    periodMs: 28 * DAY_MS,
    durationMs: 21 * DAY_MS,
    backgrounds: ["vietnam"],
    pointsPerLevel: 12,
    cleanBonus: 6,
    needsReview: true,
    tiers: [
      { score: 100, reward: { resources: res(500, 500, 500) } },
      { score: 500, reward: { resources: res(1500, 1500, 1500), shards: 4, speedupTokens: 3 } },
      { score: 1500, reward: { shards: 8, speedupTokens: 5, cosmetic: "banner_dawn" } },
    ],
  },
};
