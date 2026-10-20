import { MARCH_RESULTS, type BaseState } from "./base-state.ts";
import { BUILDING_IDS } from "./building-id.ts";
import { MAX_BUILDING_LEVEL } from "./data/buildings.ts";
import { MAX_HERO_LEVEL, MAX_HERO_SHARDS, MAX_SQUAD } from "./data/heroes.ts";
import { HERO_IDS, isHeroId } from "./hero-id.ts";
import { RESOURCE_IDS } from "./resource-id.ts";
import { TROOP_IDS } from "./troop-id.ts";
import { isTroops } from "./troops.ts";

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const isLevel = (v: unknown): boolean => isFiniteNumber(v) && Number.isInteger(v) && v >= 1 && v <= MAX_BUILDING_LEVEL;

const isResources = (v: unknown): boolean => isRecord(v) && RESOURCE_IDS.every((id) => isFiniteNumber(v[id]) && v[id] >= 0);

const isPoint = (v: unknown): boolean => isRecord(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y);

const isQueue = (q: unknown): boolean =>
  q === null ||
  (isRecord(q) &&
    BUILDING_IDS.some((id) => id === q.building) &&
    isLevel(q.toLevel) &&
    isFiniteNumber(q.startedAt) &&
    isFiniteNumber(q.endsAt));

const isTraining = (j: unknown): boolean =>
  j === null ||
  (isRecord(j) &&
    TROOP_IDS.some((id) => id === j.troop) &&
    isFiniteNumber(j.count) &&
    Number.isInteger(j.count) &&
    j.count > 0 &&
    isFiniteNumber(j.startedAt) &&
    isFiniteNumber(j.endsAt));

const isOutcome = (o: unknown): boolean =>
  o === null ||
  (isRecord(o) &&
    MARCH_RESULTS.some((r) => r === o.result) &&
    isTroops(o.survivors) &&
    isTroops(o.wounded) &&
    isTroops(o.lost) &&
    isResources(o.loot));

const isInt = (v: unknown, min: number, max: number): boolean => isFiniteNumber(v) && Number.isInteger(v) && v >= min && v <= max;

const isHeroes = (v: unknown): boolean =>
  isRecord(v) &&
  HERO_IDS.every((id) => {
    const h = v[id];
    return isRecord(h) && isInt(h.level, 0, MAX_HERO_LEVEL) && isInt(h.shards, 0, MAX_HERO_SHARDS);
  });

const isStory = (v: unknown): boolean => isRecord(v) && isInt(v.chapter, 0, 1000) && isInt(v.victories, 0, 1_000_000_000);

const isSquad = (v: unknown): boolean =>
  v === undefined ||
  (Array.isArray(v) &&
    v.length <= MAX_SQUAD &&
    v.every((m) => isRecord(m) && isHeroId(m.id) && isInt(m.level, 1, MAX_HERO_LEVEL)));

const isMarch = (m: unknown): boolean =>
  isRecord(m) &&
  typeof m.id === "string" &&
  isRecord(m.target) &&
  typeof m.target.npcId === "string" &&
  isFiniteNumber(m.target.level) &&
  isPoint(m.target) &&
  isPoint(m.from) &&
  isTroops(m.troops) &&
  isFiniteNumber(m.departAt) &&
  isFiniteNumber(m.arriveAt) &&
  isFiniteNumber(m.returnAt) &&
  isSquad(m.heroes) &&
  (m.rallyId === undefined || typeof m.rallyId === "string") &&
  isOutcome(m.outcome);

/**
 * Shape check for untrusted data (a local save, a stored row), in the current shape: run
 * `migrateBaseState` first for older data. Says nothing about plausibility.
 */
export const isBaseState = (v: unknown): v is BaseState => {
  if (!isRecord(v) || !isResources(v.resources) || !isRecord(v.levels) || !isFiniteNumber(v.lastUpdated)) return false;
  const { levels } = v;
  if (!BUILDING_IDS.every((id) => isLevel(levels[id]))) return false;
  return (
    isQueue(v.queue) &&
    isTroops(v.troops) &&
    isTroops(v.wounded) &&
    isTraining(v.training) &&
    isHeroes(v.heroes) &&
    isStory(v.story) &&
    Array.isArray(v.marches) &&
    v.marches.every(isMarch)
  );
};
