import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  BUILDING_IDS,
  BUILDINGS,
  COMBAT_TROOP_IDS,
  BACKGROUND_IDS,
  HERO_IDS,
  heroesFor,
  HERO_RARITIES,
  HEROES,
  MAX_BUILDING_LEVEL,
  NPC_LEVELS,
  RESOURCE_IDS,
  STORAGE_CAPS,
} from "../src/index.ts";

describe("balance tables", () => {
  test("every building has one row per level, increasing in rate (producers) and time", () => {
    for (const id of BUILDING_IDS) {
      const rows = BUILDINGS[id].levels;
      expect(rows).toHaveLength(MAX_BUILDING_LEVEL);
      for (let i = 1; i < rows.length; i++) {
        if (BUILDINGS[id].produces === null) expect(rows[i]!.ratePerHour, `${id} L${i + 1} rate`).toBe(0);
        else expect(rows[i]!.ratePerHour, `${id} L${i + 1} rate`).toBeGreaterThan(rows[i - 1]!.ratePerHour);
        expect(rows[i]!.durationSec, `${id} L${i + 1} time`).toBeGreaterThan(rows[i - 1]!.durationSec);
      }
    }
    expect(STORAGE_CAPS).toHaveLength(MAX_BUILDING_LEVEL);
  });

  test("every upgrade cost fits in the storage cap at the HQ level that allows it", () => {
    for (const id of BUILDING_IDS) {
      BUILDINGS[id].levels.forEach((row, i) => {
        const toLevel = i + 1;
        if (toLevel === 1) return;
        // HQ upgrades happen at HQ (toLevel - 1); others need HQ >= toLevel.
        const hqLevel = id === "hq" ? toLevel - 1 : toLevel;
        const cap = STORAGE_CAPS[hqLevel - 1]!;
        for (const r of RESOURCE_IDS) expect(row.cost[r], `${id} L${toLevel} ${r}`).toBeLessThanOrEqual(cap[r]);
      });
    }
  });

  test("support needed for HQ upgrades is produced (some source has a rate)", () => {
    expect(BUILDINGS.hq.produces).toBe("support");
  });
});

describe("hero tables", () => {
  test("every hero has a combat specialty and rarity", () => {
    for (const id of HERO_IDS) {
      expect(HERO_RARITIES).toContain(HEROES[id].rarity);
      expect(COMBAT_TROOP_IDS as readonly string[]).toContain(HEROES[id].specialty);
    }
  });

  test("each background roster can draw every rarity, and the rosters partition the hero ids", () => {
    const all = BACKGROUND_IDS.flatMap((b) => [...heroesFor(b)]);
    expect([...all].sort()).toEqual([...HERO_IDS].sort());
    for (const b of BACKGROUND_IDS) {
      for (const rarity of HERO_RARITIES) expect(heroesFor(b).some((id) => HEROES[id].rarity === rarity), `${b} ${rarity}`).toBe(true);
    }
  });
});

describe("purity", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });

  test("rules source never reads the clock, randomness or timers", () => {
    const src = join(import.meta.dirname, "..", "src");
    for (const f of files(src)) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/Date\.now|new Date\(|Math\.random|setInterval|setTimeout|performance\.now/);
    }
  });
});
