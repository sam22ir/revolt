import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  BUILDING_IDS,
  BUILDINGS,
  COMBAT_TROOP_IDS,
  HERO_IDS,
  HERO_LEVEL_UP,
  HERO_RARITIES,
  HEROES,
  MAX_BUILDING_LEVEL,
  MAX_HERO_LEVEL,
  MAX_SQUAD,
  NPC_LEVELS,
  NPC_SHARD_DROP,
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
  test("level-up costs rise and cover every level below the top", () => {
    expect(HERO_LEVEL_UP).toHaveLength(MAX_HERO_LEVEL - 1);
    HERO_LEVEL_UP.forEach((row, i) => {
      if (i === 0) return;
      expect(row.shards).toBeGreaterThan(HERO_LEVEL_UP[i - 1]!.shards);
      for (const id of RESOURCE_IDS) expect(row.resources[id]).toBeGreaterThanOrEqual(HERO_LEVEL_UP[i - 1]!.resources[id]);
    });
  });

  test("every hero has a combat specialty, a command skill from level 1 and two passives that unlock in range", () => {
    for (const id of HERO_IDS) {
      const h = HEROES[id];
      expect(HERO_RARITIES).toContain(h.rarity);
      expect(COMBAT_TROOP_IDS as readonly string[]).toContain(h.specialty);
      expect(h.skills.filter((s) => s.slot === "command")).toHaveLength(1);
      expect(h.skills.filter((s) => s.slot === "passive")).toHaveLength(2);
      for (const sk of h.skills) {
        expect(sk.unlockLevel, `${id} unlock`).toBeGreaterThanOrEqual(1);
        expect(sk.unlockLevel, `${id} unlock`).toBeLessThanOrEqual(MAX_HERO_LEVEL);
        expect(sk.base).toBeGreaterThan(0);
      }
      expect(h.skills.find((s) => s.slot === "command")!.unlockLevel).toBe(1);
      expect(h.recruitShards).toBeGreaterThan(0);
    }
  });

  test("rarer heroes cost more to recruit", () => {
    const cost = (r: string): number => Math.max(...HERO_IDS.filter((id) => HEROES[id].rarity === r).map((id) => HEROES[id].recruitShards));
    expect(cost("rare")).toBeGreaterThan(cost("common"));
    expect(cost("legendary")).toBeGreaterThan(cost("rare"));
  });

  test("shard drops cover every NPC level and grow with it; a squad is lead plus two", () => {
    expect(NPC_SHARD_DROP).toHaveLength(NPC_LEVELS.length);
    NPC_SHARD_DROP.forEach((n, i) => i > 0 && expect(n).toBeGreaterThan(NPC_SHARD_DROP[i - 1]!));
    expect(MAX_SQUAD).toBe(3);
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
