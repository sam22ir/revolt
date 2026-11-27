import { test } from "vitest";
import { createBaseState, importM1Save, M1_IMPORT_MAX_LEVEL, startUpgrade, storageCap, type BaseState, NO_WORLD } from "../src/index.ts";
import { base, DAY, ex, HOUR, T0 } from "./helpers.ts";

const NOW = T0 + HOUR;

test("importM1Save: keeps plausible saves, rejects malformed, clamps forged levels, resources, time and jobs", () => {
  {
    const r = startUpgrade(base(), "farm", T0, NO_WORLD);
    if (!r.ok) throw new Error(r.reason);
    ex("keeps a plausible save as it is")(importM1Save(r.state, NOW)).toEqual(r.state);
  }

  {
    const e = ex("malformed input gives a fresh base at server time");
    for (const bad of [null, "x", 42, {}, { ...createBaseState(T0), levels: { hq: 0 } }]) {
      e(importM1Save(bad, NOW), JSON.stringify(bad)).toEqual(createBaseState(NOW));
    }
  }

  {
    const e = ex("forged levels are capped, and producers never exceed the HQ");
    const forged: BaseState = { ...base(), levels: { hq: 10, farm: 10, armory: 2, treasury: 1, barracks: 1, hero_hall: 1, watchtower: 1, infirmary: 1 } };
    e(importM1Save(forged, NOW).levels, "capped").toEqual({ hq: M1_IMPORT_MAX_LEVEL, farm: M1_IMPORT_MAX_LEVEL, armory: 2, treasury: 1, barracks: 1, hero_hall: 1, watchtower: 1, infirmary: 1 });
    const lopsided: BaseState = { ...base(), levels: { hq: 1, farm: 3, armory: 1, treasury: 1, barracks: 1, hero_hall: 1, watchtower: 1, infirmary: 1 } };
    e(importM1Save(lopsided, NOW).levels.farm, "producer above HQ").toBe(1);
  }

  {
    const forged: BaseState = { ...base(), resources: { food: 1e12, materiel: 1e12, funds: 1e12, support: 1e12 } };
    ex("forged resources are clamped to the storage cap")(importM1Save(forged, NOW).resources).toEqual(storageCap(2));
  }

  ex("a save from the future is pulled back to now (clock went backwards)")(
    importM1Save(base({ lastUpdated: T0 + 10 * DAY }), NOW).lastUpdated,
  ).toBe(NOW);

  ex("a very old save keeps its timestamp; production stays capped")(
    importM1Save(base({ lastUpdated: T0 - 365 * DAY }), NOW).lastUpdated,
  ).toBe(T0 - 365 * DAY);

  {
    const e = ex("implausible queued jobs are dropped");
    const job = { building: "farm" as const, toLevel: 2, startedAt: T0, endsAt: T0 + 30_000 };
    e(importM1Save(base({ queue: job }), NOW).queue, "plausible kept").toEqual(job);
    e(importM1Save(base({ queue: { ...job, endsAt: T0 + 1 } }), NOW).queue, "instant").toBeNull();
    e(importM1Save(base({ queue: { ...job, toLevel: 3, endsAt: T0 + 9e9 } }), NOW).queue, "skipped level").toBeNull();
    e(importM1Save(base({ queue: { ...job, startedAt: NOW + 1, endsAt: NOW + 30_001 } }), NOW).queue, "future start").toBeNull();
    const gated = { ...job, building: "farm" as const, toLevel: 2 };
    e(
      importM1Save({ ...base(), levels: { hq: 1, farm: 1, armory: 1, treasury: 1, barracks: 1, hero_hall: 1, watchtower: 1, infirmary: 1 }, queue: gated }, NOW).queue,
      "HQ gated",
    ).toBeNull();
  }
});
