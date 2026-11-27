import { describe, expect, test } from "vitest";
import {
  ACADEMY_LEVEL_FOR,
  accrue,
  advance,
  carryCapacity,
  checkStudy,
  createBaseState,
  healingQuote,
  healingLessons,
  isBaseState,
  lessonBonus,
  LESSONS,
  maxHealingBatch,
  maxTrainingBatch,
  migrateBaseState,
  productionFor,
  productionPerHour,
  startStudy,
  storageCap,
  storageCapFor,
  STUDY_MS,
  studyQuote,
  trainingLessons,
  trainingQuote,
  travelMs,
  type BaseState,
  type LessonId,
} from "../src/index.ts";
import { DAY, rich, T0 } from "./helpers.ts";

const NO_WORLD = { liberations: [] };
const taught = (s: BaseState, ...ids: LessonId[]): BaseState => ({ ...s, lessonsTaught: ids });
const knowing = (s: BaseState, ...ids: LessonId[]): BaseState => ({ ...s, lessons: ids });

describe("studying at the academy", () => {
  test("only a taught lesson, once, one at a time, with the academy's level and the resources", () => {
    const s = taught(rich(), "hidden_paths", "night_marches");
    expect(checkStudy(s, "flying")).toBe("unknown_lesson");
    expect(checkStudy(s, "high_passes")).toBe("not_taught");
    expect(checkStudy(s, "night_marches")).toBe("academy_level");
    expect(checkStudy({ ...s, levels: { ...s.levels, academy: ACADEMY_LEVEL_FOR[2] } }, "night_marches")).toBeNull();
    expect(checkStudy({ ...s, resources: { food: 0, materiel: 0, funds: 0, support: 0 } }, "hidden_paths")).toBe("insufficient");
    expect(checkStudy(knowing(s, "hidden_paths"), "hidden_paths")).toBe("already_studied");
    const r = startStudy(s, "hidden_paths", T0, NO_WORLD);
    if (!r.ok) throw new Error(r.reason);
    expect(checkStudy({ ...r.state, levels: { ...r.state.levels, academy: 9 } }, "night_marches")).toBe("study_busy");
  });

  test("a study is paid now and learned for good at its end, even after a long gap", () => {
    const s = taught(rich(), "strong_packs");
    const r = startStudy(s, "strong_packs", T0, NO_WORLD);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.resources.food).toBeCloseTo(advance(s, T0, NO_WORLD).resources.food - studyQuote("strong_packs").cost.food, 6);
    expect(advance(r.state, T0 + STUDY_MS[1] - 1, NO_WORLD).lessons).toEqual([]);
    expect(advance(r.state, T0 + STUDY_MS[1], NO_WORLD)).toMatchObject({ lessons: ["strong_packs"], study: null });
    expect(advance(r.state, T0 + 300 * DAY, NO_WORLD).lessons).toEqual(["strong_packs"]);
  });

  test("an older base has the academy at level 1 and nothing studied", () => {
    const old = { ...createBaseState(T0), levels: { ...createBaseState(T0).levels } } as Record<string, any>;
    delete old.levels.academy;
    delete old.lessons;
    delete old.study;
    const m = migrateBaseState(old) as BaseState;
    expect(isBaseState(m)).toBe(true);
    expect([m.levels.academy, m.lessons, m.study]).toEqual([1, [], null]);
    expect(isBaseState({ ...createBaseState(T0), study: { lesson: "flying", startedAt: 0, endsAt: 1 } })).toBe(false);
  });
});

describe("what lessons do", () => {
  test("bonuses add up over the lessons studied, and nothing without them", () => {
    expect(lessonBonus(rich(), "march_speed")).toBe(0);
    expect(lessonBonus(knowing(rich(), "hidden_paths", "night_marches"), "march_speed")).toBeCloseTo(LESSONS.hidden_paths.value + LESSONS.night_marches.value, 9);
  });

  test("shepherds: marches are faster", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 30, y: 0 };
    const t = { infantry: 10, scouts: 0, heavy: 0, porters: 0 };
    expect(travelMs(from, to, t, 0.2)).toBeLessThan(travelMs(from, to, t));
  });

  test("smiths: training is cheaper, faster and bigger; nothing changes without lessons", () => {
    const none = trainingLessons(rich());
    expect(trainingQuote("infantry", 10, none)).toEqual(trainingQuote("infantry", 10));
    const all = trainingLessons(knowing(rich(), "repair_work", "metal_craft", "master_smith"));
    expect(trainingQuote("infantry", 10, all).cost.food).toBeLessThan(trainingQuote("infantry", 10).cost.food);
    expect(trainingQuote("infantry", 10, all).durationMs).toBeLessThan(trainingQuote("infantry", 10).durationMs);
    expect(maxTrainingBatch(2, all)).toBeGreaterThan(maxTrainingBatch(2));
  });

  test("healers: healing is cheaper, bigger and faster", () => {
    const l = healingLessons(knowing(rich(), "herbal_remedies", "bone_setting", "convalescence"));
    const w = { infantry: 10, scouts: 0, heavy: 0, porters: 0 };
    expect(healingQuote(w, l).cost.food).toBeLessThan(healingQuote(w).cost.food);
    expect(healingQuote(w, l).durationMs).toBeLessThan(healingQuote(w).durationMs);
    expect(maxHealingBatch(2, l)).toBeGreaterThan(maxHealingBatch(2));
  });

  test("weavers: porters carry more, storage holds more and production fills it", () => {
    const t = { infantry: 0, scouts: 0, heavy: 0, porters: 10 };
    expect(carryCapacity(t, 0.15)).toBeCloseTo(carryCapacity(t) * 1.15, 6);
    expect(carryCapacity({ ...t, porters: 0, infantry: 10 }, 0.5)).toBe(carryCapacity({ ...t, porters: 0, infantry: 10 }));
    const s = knowing(rich(), "grain_sacks", "woven_stores");
    expect(storageCapFor(s).food).toBe(Math.floor(storageCap(s.levels.hq).food * 1.2));
    const full = { ...s, resources: { ...s.resources, food: storageCap(s.levels.hq).food } };
    expect(accrue(full, T0 + DAY, NO_WORLD).resources.food).toBeGreaterThan(storageCap(s.levels.hq).food);
  });

  test("messengers: more popular support", () => {
    const s = knowing(rich(), "safe_houses");
    expect(productionFor(s, 1).support).toBeCloseTo(productionPerHour(s.levels, 1).support * (1 + LESSONS.safe_houses.value), 9);
    expect(productionFor(s, 1).food).toBe(productionPerHour(s.levels, 1).food);
  });
});
