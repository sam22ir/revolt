import { describe, expect, test } from "vitest";
import {
  DAY_MS,
  helpVillage,
  LESSON_IDS,
  LESSONS,
  lessonAt,
  needAmount,
  NEED_KINDS,
  NO_TRUST,
  TRUST_DECAY_PER_DAY,
  TRUST_LEVELS,
  TRUST_MAX,
  TRUST_PER_HELP,
  trustAt,
  trustLevel,
  VILLAGE_KINDS,
  villageDay,
  villageNeed,
  type VillageTrust,
} from "../src/index.ts";
import { T0 } from "./helpers.ts";

const at = (trust: number, when = T0, taught = 0, helpedDay = -1): VillageTrust => ({ trust, at: when, taught, helpedDay });
const ok = (r: ReturnType<typeof helpVillage>) => {
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe("trust fades", () => {
  test("by the day's decay, continuously, down to nothing", () => {
    expect(trustAt(at(100), T0)).toBe(100);
    expect(trustAt(at(100), T0 + DAY_MS)).toBeCloseTo(100 - TRUST_DECAY_PER_DAY, 9);
    expect(trustAt(at(100), T0 + DAY_MS / 2)).toBeCloseTo(100 - TRUST_DECAY_PER_DAY / 2, 9);
    expect(trustAt(at(100), T0 + 400 * DAY_MS)).toBe(0);
  });

  test("time going backwards adds nothing, and nothing goes above the cap", () => {
    expect(trustAt(at(100), T0 - 5 * DAY_MS)).toBe(100);
    expect(trustAt(at(TRUST_MAX + 50), T0)).toBe(TRUST_MAX);
  });

  test("levels come at the thresholds", () => {
    expect(trustLevel(0)).toBe(0);
    expect(trustLevel(TRUST_LEVELS[0] - 0.01)).toBe(0);
    expect(trustLevel(TRUST_LEVELS[0])).toBe(1);
    expect(trustLevel(TRUST_LEVELS[2])).toBe(3);
    expect(trustLevel(TRUST_MAX)).toBe(3);
  });
});

describe("helping", () => {
  test("adds trust after the fade, once per village day", () => {
    const r = ok(helpVillage(at(50, T0), "shepherds", T0 + DAY_MS, 7));
    expect(r.record.trust).toBeCloseTo(50 - TRUST_DECAY_PER_DAY + TRUST_PER_HELP, 9);
    expect(r.record.helpedDay).toBe(7);
    expect(helpVillage(r.record, "shepherds", T0 + DAY_MS + 1000, 7)).toEqual({ ok: false, reason: "already_helped_today" });
    expect(helpVillage(r.record, "shepherds", T0 + 2 * DAY_MS, 8).ok).toBe(true);
  });

  test("reaching a level teaches its lesson once; fading and coming back does not teach it again", () => {
    const first = ok(helpVillage(at(TRUST_LEVELS[0] - 5), "healers", T0, 1));
    expect(first.taught).toEqual([lessonAt("healers", 1)]);
    expect(first.record.taught).toBe(1);
    const faded = { ...first.record, at: T0, trust: first.record.trust };
    const later = ok(helpVillage(faded, "healers", T0 + 20 * DAY_MS, 30));
    expect(trustLevel(trustAt(faded, T0 + 20 * DAY_MS))).toBe(0);
    expect(later.taught).toEqual([]);
  });

  test("a big jump teaches every level it passes, in order", () => {
    const r = ok(helpVillage(at(TRUST_LEVELS[2] - 1), "smiths", T0, 2));
    expect(r.taught).toEqual([lessonAt("smiths", 1), lessonAt("smiths", 2), lessonAt("smiths", 3)]);
  });

  test("help at the cap stays at the cap", () => {
    expect(ok(helpVillage(at(TRUST_MAX), "weavers", T0, 3)).record.trust).toBe(TRUST_MAX);
  });

  test("a clock that went backwards keeps the later timestamp", () => {
    expect(ok(helpVillage(at(10, T0 + DAY_MS), "weavers", T0, 3)).record.at).toBe(T0 + DAY_MS);
  });

  test("from nothing, the first help is a start, not a lesson", () => {
    const r = ok(helpVillage(NO_TRUST, "messengers", T0, 0));
    expect([r.record.trust, r.taught.length]).toEqual([TRUST_PER_HELP, 0]);
  });
});

describe("needs and days", () => {
  test("the day turns at local midnight, per background", () => {
    const midnightUtc = Date.UTC(2026, 10, 28);
    expect(villageDay(midnightUtc - 60 * 60_000, "algeria")).toBe(villageDay(midnightUtc - 60 * 60_000 - 1, "algeria") + 1);
    expect(villageDay(midnightUtc - 7 * 60 * 60_000, "vietnam")).toBe(villageDay(midnightUtc - 7 * 60 * 60_000 - 1, "vietnam") + 1);
  });

  test("a village's need is fixed for a day, the same for everyone, and changes over days", () => {
    expect(villageNeed(42, "village:3", 100)).toBe(villageNeed(42, "village:3", 100));
    const seen = new Set(Array.from({ length: 60 }, (_, d) => villageNeed(42, "village:3", d)));
    expect(seen.size).toBe(NEED_KINDS.length);
    expect(Array.from({ length: 20 }, (_, i) => villageNeed(42, `village:${i}`, 9)).some((n, _, all) => n !== all[0])).toBe(true);
  });

  test("deliveries grow with trust; the other needs ask no amount", () => {
    expect(needAmount("food", 0)).toBeLessThan(needAmount("food", 3));
    expect(needAmount("funds", 1)).toBeGreaterThan(0);
    for (const n of ["care", "labor", "protection"] as const) expect(needAmount(n, 2)).toBe(0);
  });
});

describe("lessons", () => {
  test("every village teaches exactly one lesson per level", () => {
    for (const kind of VILLAGE_KINDS) for (const level of [1, 2, 3]) expect(lessonAt(kind, level), `${kind} ${level}`).not.toBeNull();
    expect(LESSON_IDS.length).toBe(VILLAGE_KINDS.length * 3);
    expect(lessonAt("smiths", 4)).toBeNull();
  });

  test("smiths unlock troop tiers in order", () => {
    expect([1, 2, 3].map((l) => LESSONS[lessonAt("smiths", l)!].value)).toEqual([2, 3, 4]);
  });
});
