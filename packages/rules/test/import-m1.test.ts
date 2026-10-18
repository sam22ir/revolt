import { describe, expect, test } from "vitest";
import { createBaseState, importM1Save, M1_IMPORT_MAX_LEVEL, startUpgrade, storageCap, type BaseState } from "../src/index.ts";
import { base, DAY, HOUR, T0 } from "./helpers.ts";

const NOW = T0 + HOUR;

describe("importM1Save", () => {
  test("keeps a plausible save as it is", () => {
    const r = startUpgrade(base(), "farm", T0);
    if (!r.ok) throw new Error(r.reason);
    expect(importM1Save(r.state, NOW)).toEqual(r.state);
  });

  test("malformed input gives a fresh base at server time", () => {
    for (const bad of [null, "x", 42, {}, { ...createBaseState(T0), levels: { hq: 0 } }]) {
      expect(importM1Save(bad, NOW)).toEqual(createBaseState(NOW));
    }
  });

  test("forged levels are capped, and producers never exceed the HQ", () => {
    const forged: BaseState = { ...base(), levels: { hq: 10, farm: 10, armory: 2, treasury: 1 } };
    expect(importM1Save(forged, NOW).levels).toEqual({ hq: M1_IMPORT_MAX_LEVEL, farm: M1_IMPORT_MAX_LEVEL, armory: 2, treasury: 1 });
    const lopsided: BaseState = { ...base(), levels: { hq: 1, farm: 3, armory: 1, treasury: 1 } };
    expect(importM1Save(lopsided, NOW).levels.farm).toBe(1);
  });

  test("forged resources are clamped to the storage cap", () => {
    const forged: BaseState = { ...base(), resources: { food: 1e12, materiel: 1e12, funds: 1e12, support: 1e12 } };
    expect(importM1Save(forged, NOW).resources).toEqual(storageCap(2));
  });

  test("a save from the future is pulled back to now (clock went backwards)", () => {
    expect(importM1Save(base({ lastUpdated: T0 + 10 * DAY }), NOW).lastUpdated).toBe(NOW);
  });

  test("a very old save keeps its timestamp; production stays capped", () => {
    expect(importM1Save(base({ lastUpdated: T0 - 365 * DAY }), NOW).lastUpdated).toBe(T0 - 365 * DAY);
  });

  test("implausible queued jobs are dropped", () => {
    const job = { building: "farm" as const, toLevel: 2, startedAt: T0, endsAt: T0 + 30_000 };
    expect(importM1Save(base({ queue: job }), NOW).queue).toEqual(job);
    const instant = { ...job, endsAt: T0 + 1 };
    expect(importM1Save(base({ queue: instant }), NOW).queue).toBeNull();
    const skip = { ...job, toLevel: 3, endsAt: T0 + 9e9 };
    expect(importM1Save(base({ queue: skip }), NOW).queue).toBeNull();
    const future = { ...job, startedAt: NOW + 1, endsAt: NOW + 30_001 };
    expect(importM1Save(base({ queue: future }), NOW).queue).toBeNull();
    const gated = { ...job, building: "farm" as const, toLevel: 2 };
    expect(importM1Save({ ...base(), levels: { hq: 1, farm: 1, armory: 1, treasury: 1 }, queue: gated }, NOW).queue).toBeNull();
  });
});
