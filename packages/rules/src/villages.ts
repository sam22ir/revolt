import type { BackgroundId } from "./background.ts";
import { DAY_MS } from "./data/events.ts";
import {
  LESSON_IDS,
  LESSONS,
  MAX_TRUST_LEVEL,
  NEED_FOOD,
  NEED_FUNDS,
  NEED_KINDS,
  TRUST_DECAY_PER_DAY,
  TRUST_LEVELS,
  TRUST_MAX,
  TRUST_PER_HELP,
  VILLAGE_DAY_OFFSET_MS,
  type LessonId,
  type NeedKind,
  type VillageKind,
} from "./data/villages.ts";

/** One player's standing with one village: trust as it was at `at` (epoch ms), the highest level that taught its lesson, and the
 * village day of the last help (one help per village per day). */
export interface VillageTrust {
  readonly trust: number;
  readonly at: number;
  readonly taught: number;
  readonly helpedDay: number;
}

export const NO_TRUST: VillageTrust = { trust: 0, at: 0, taught: 0, helpedDay: -1 };

const DECAY_PER_MS = TRUST_DECAY_PER_DAY / DAY_MS;

/** Trust at `now`: it fades continuously from `at`; time going backwards never adds any. */
export const trustAt = (r: VillageTrust, now: number): number => Math.max(0, Math.min(TRUST_MAX, r.trust - DECAY_PER_MS * Math.max(0, now - r.at)));

/** The trust level (0 to 3) a trust amount reaches. */
export const trustLevel = (trust: number): number => TRUST_LEVELS.filter((t) => trust >= t).length;

/** The village day containing `now` for this background. */
export const villageDay = (now: number, background: BackgroundId): number => Math.floor((now + VILLAGE_DAY_OFFSET_MS[background]) / DAY_MS);

/** A small, stable string hash (FNV-1a), so a village's daily need is the same on every machine. */
const hashString = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
};

/** The need village `villageId` has on `day`, the same for every player of its map. `mapSeed` keeps two maps' villages apart. */
export const villageNeed = (mapSeed: number, villageId: string, day: number): NeedKind => NEED_KINDS[hashString(`${mapSeed}:${villageId}:${day}`) % NEED_KINDS.length]!;

/** How much a delivery need asks at the player's trust level `t`; 0 for needs that are not deliveries. */
export const needAmount = (need: NeedKind, t: number): number => (need === "food" ? NEED_FOOD(t) : need === "funds" ? NEED_FUNDS(t) : 0);

/** The lesson village `kind` teaches at trust `level` (1 to 3). */
export const lessonAt = (kind: VillageKind, level: number): LessonId | null => LESSON_IDS.find((id) => LESSONS[id].village === kind && LESSONS[id].level === level) ?? null;

export const VILLAGE_HELP_BLOCK_REASONS = ["already_helped_today"] as const;
export type VillageHelpBlockReason = (typeof VILLAGE_HELP_BLOCK_REASONS)[number];

export type VillageHelpResult =
  | { readonly ok: true; readonly record: VillageTrust; readonly taught: readonly LessonId[] }
  | { readonly ok: false; readonly reason: VillageHelpBlockReason };

/**
 * Records one answered need at `now`: trust fades to `now`, rises by TRUST_PER_HELP (capped), and every level reached for the first
 * time teaches its lesson. Whether the need itself was met (the delivery, the care, the labor, the battle) is checked by the caller.
 */
export const helpVillage = (r: VillageTrust, kind: VillageKind, now: number, day: number): VillageHelpResult => {
  if (r.helpedDay === day) return { ok: false, reason: "already_helped_today" };
  const trust = Math.min(TRUST_MAX, trustAt(r, now) + TRUST_PER_HELP);
  const level = trustLevel(trust);
  const taught: LessonId[] = [];
  for (let l = r.taught + 1; l <= Math.min(level, MAX_TRUST_LEVEL); l++) {
    const id = lessonAt(kind, l);
    if (id !== null) taught.push(id);
  }
  return { ok: true, record: { trust, at: Math.max(now, r.at), taught: Math.max(r.taught, level), helpedDay: day }, taught };
};
