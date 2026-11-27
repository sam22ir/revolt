import { describe, expect, test } from "vitest";
import {
  checkDailyClaim,
  checkQuestClaim,
  currentQuest,
  DAILY_MISSION_IDS,
  DAILY_MISSIONS,
  dailyClaimKey,
  dailyMissions,
  goalProgress,
  metricKey,
  missionDay,
  missionDayStart,
  missionTick,
  QUEST_IDS,
  QUESTS,
  rewardHasBaseParts,
  type DailyMissionId,
  type QuestId,
} from "../src/index.ts";
import { base, DAY, HOUR, withHeroes } from "./helpers.ts";

const midnightUtc = Date.UTC(2026, 10, 27);
const out = { inAlliance: false };
const all = (ids: readonly QuestId[]): Set<QuestId> => new Set(ids);

describe("mission days", () => {
  test("Algeria resets at local midnight (23:00 UTC)", () => {
    const d = missionDay(midnightUtc - HOUR - 1, "algeria");
    expect(missionDay(midnightUtc - HOUR, "algeria")).toBe(d + 1);
    expect(missionDayStart(d + 1, "algeria")).toBe(midnightUtc - HOUR);
  });

  test("Vietnam resets at local midnight (17:00 UTC the day before)", () => {
    const start = midnightUtc - 7 * HOUR;
    expect(missionDay(start, "vietnam")).toBe(missionDay(start - 1, "vietnam") + 1);
    expect(missionDayStart(missionDay(start, "vietnam"), "vietnam")).toBe(start);
  });

  test("every moment of a day maps back to that day's start", () => {
    for (const bg of ["algeria", "vietnam"] as const) {
      const d = missionDay(midnightUtc, bg);
      const s = missionDayStart(d, bg);
      expect(missionDay(s, bg)).toBe(d);
      expect(missionDay(s + DAY - 1, bg)).toBe(d);
      expect(missionDay(s + DAY, bg)).toBe(d + 1);
    }
  });

  test("keys name the day", () => {
    expect(metricKey(7, "npc_victories")).toBe("daily:7:npc_victories");
    expect(dailyClaimKey(7, "daily_fight")).toBe("daily:7:daily_fight");
  });
});

describe("mission ticks", () => {
  test("a counted action lands on the day it happened", () => {
    const t = missionTick("algeria", midnightUtc, "troops_trained", "train:1", 15);
    expect(t).toEqual({ source: "train:1", key: metricKey(missionDay(midnightUtc, "algeria"), "troops_trained"), points: 15 });
  });

  test("nothing, fractions and junk count nothing", () => {
    expect(missionTick("algeria", midnightUtc, "helps_given", "h", 0)).toBeNull();
    expect(missionTick("algeria", midnightUtc, "helps_given", "h", -3)).toBeNull();
    expect(missionTick("algeria", midnightUtc, "helps_given", "h", 0.5)).toBeNull();
    expect(missionTick("algeria", Number.NaN, "helps_given", "h", 1)).toBeNull();
    expect(missionTick("algeria", midnightUtc, "helps_given", "h", 2.9)?.points).toBe(2);
  });
});

describe("daily missions", () => {
  test("progress is capped at the target and done at the target", () => {
    const m = dailyMissions({ upgrades_started: 1, troops_trained: 500, npc_victories: 3 }, new Set());
    const by = (id: DailyMissionId) => m.find((x) => x.id === id)!;
    expect(by("daily_build")).toMatchObject({ progress: 1, done: false });
    expect(by("daily_train")).toMatchObject({ progress: DAILY_MISSIONS.daily_train.target, done: true });
    expect(by("daily_fight")).toMatchObject({ progress: 3, done: true });
    expect(by("daily_help")).toMatchObject({ progress: 0, done: false });
  });

  test("negative or fractional sums are read as whole counts from zero", () => {
    const m = dailyMissions({ upgrades_started: -4, helps_given: 2.9 }, new Set());
    expect(m.find((x) => x.id === "daily_build")!.progress).toBe(0);
    expect(m.find((x) => x.id === "daily_help")!.progress).toBe(2);
  });

  test("claims: unknown, not done, done, already claimed", () => {
    const sums = { npc_victories: 5 };
    expect(checkDailyClaim(dailyMissions(sums, new Set()), "nope")).toBe("unknown_mission");
    expect(checkDailyClaim(dailyMissions(sums, new Set()), "daily_build")).toBe("not_done");
    expect(checkDailyClaim(dailyMissions(sums, new Set()), "daily_fight")).toBeNull();
    expect(checkDailyClaim(dailyMissions(sums, new Set(["daily_fight"])), "daily_fight")).toBe("already_claimed");
  });

  test("every mission has a target and pays something", () => {
    for (const id of DAILY_MISSION_IDS) {
      const d = DAILY_MISSIONS[id];
      expect(d.target).toBeGreaterThan(0);
      expect(rewardHasBaseParts(d.reward) || (d.reward.speedupTokens ?? 0) > 0).toBe(true);
      expect(d.passXp).toBeGreaterThan(0);
    }
  });
});

describe("beginner quests", () => {
  test("the chain starts at the first quest", () => {
    expect(currentQuest(base(), out, new Set())).toMatchObject({ id: QUEST_IDS[0], progress: 1, target: 2, done: false });
  });

  test("a building quest is done at the level, and stays done above it", () => {
    const s = base({ levels: { ...base().levels, farm: 5 } });
    expect(currentQuest(s, out, new Set())).toMatchObject({ id: "first_farm", progress: 2, done: true });
  });

  test("claims follow the chain order", () => {
    const s = base({ levels: { ...base().levels, farm: 2, armory: 2 } });
    expect(checkQuestClaim(s, out, new Set(), "first_armory")).toBe("not_current");
    expect(checkQuestClaim(s, out, new Set(), "first_farm")).toBeNull();
    expect(checkQuestClaim(s, out, all(["first_farm"]), "first_farm")).toBe("already_claimed");
    expect(checkQuestClaim(s, out, all(["first_farm"]), "first_armory")).toBeNull();
    expect(checkQuestClaim(s, out, all(["first_farm", "first_armory"]), "first_treasury")).toBe("not_done");
    expect(checkQuestClaim(s, out, new Set(), "nope")).toBe("unknown_mission");
  });

  test("troops count at home and on marches, not wounded", () => {
    const goal = QUESTS.first_troops.goal;
    const home = base({ troops: { infantry: 8, scouts: 0, heavy: 0, porters: 0 }, wounded: { infantry: 50, scouts: 0, heavy: 0, porters: 0 } });
    expect(goalProgress(goal, home, out)).toBe(8);
    const march = {
      id: "m1",
      target: { npcId: "n", level: 1, x: 1, y: 1 },
      from: { x: 0, y: 0 },
      troops: { infantry: 10, scouts: 0, heavy: 0, porters: 0 },
      departAt: 0,
      arriveAt: 1,
      returnAt: 2,
      outcome: null,
    };
    expect(goalProgress(goal, { ...home, marches: [march] }, out)).toBe(18);
    const back = { ...march, outcome: { result: "victory" as const, survivors: { infantry: 6, scouts: 0, heavy: 0, porters: 0 }, wounded: march.troops, lost: march.troops, loot: { food: 0, materiel: 0, funds: 0, support: 0 } } };
    expect(goalProgress(goal, { ...home, marches: [back] }, out)).toBe(14);
  });

  test("heroes, victories, chapters and the alliance", () => {
    const s = withHeroes(base({ story: { chapter: 1, victories: 2 } }), { mountain_guide: { level: 1, shards: 0 } });
    expect(goalProgress(QUESTS.first_hero.goal, s, out)).toBe(1);
    expect(goalProgress(QUESTS.first_victory.goal, s, out)).toBe(1);
    expect(goalProgress(QUESTS.first_chapter.goal, s, out)).toBe(1);
    expect(goalProgress(QUESTS.first_alliance.goal, s, out)).toBe(0);
    expect(goalProgress(QUESTS.first_alliance.goal, s, { inAlliance: true })).toBe(1);
  });

  test("the chain ends", () => {
    expect(currentQuest(base(), out, all(QUEST_IDS))).toBeNull();
    expect(checkQuestClaim(base(), out, all(QUEST_IDS), "first_hq")).toBe("already_claimed");
  });

  test("every quest is reachable from the start and pays something", () => {
    for (const id of QUEST_IDS) {
      const q = QUESTS[id];
      expect(rewardHasBaseParts(q.reward) || (q.reward.speedupTokens ?? 0) > 0).toBe(true);
      if (q.goal.kind === "building_level") expect(base().levels[q.goal.building]).toBeLessThan(q.goal.level);
    }
  });
});
