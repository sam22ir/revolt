import type { HeroId } from "./hero-id.ts";

/** One owned hero: level from 1 up, and shards banked for level-ups. */
export interface HeroEntry {
  readonly level: number;
  readonly shards: number;
}

/** Heroes a player owns, and the draws since the last rare-or-better hero (the pity counter). */
export interface HeroRoster {
  readonly owned: Readonly<Partial<Record<HeroId, HeroEntry>>>;
  readonly pity: number;
}

export const EMPTY_HERO_ROSTER: HeroRoster = { owned: {}, pity: 0 };

/** Shape check for an untrusted entry. */
export const isHeroEntry = (v: unknown): boolean => {
  if (typeof v !== "object" || v === null) return false;
  const { level, shards } = v as Record<string, unknown>;
  return typeof level === "number" && Number.isInteger(level) && level >= 1 && typeof shards === "number" && Number.isInteger(shards) && shards >= 0;
};
