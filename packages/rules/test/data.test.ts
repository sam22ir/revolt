import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { BUILDING_IDS, BUILDINGS, MAX_BUILDING_LEVEL, RESOURCE_IDS, STORAGE_CAPS } from "../src/index.ts";
import { ex } from "./helpers.ts";

test("balance tables: level rows, rate and time increase, costs fit the cap, support is produced", () => {
  {
    const e = ex("every building has one row per level, increasing in rate (producers) and time");
    for (const id of BUILDING_IDS) {
      const rows = BUILDINGS[id].levels;
      e(rows, `${id} rows`).toHaveLength(MAX_BUILDING_LEVEL);
      for (let i = 1; i < rows.length; i++) {
        if (BUILDINGS[id].produces === null) e(rows[i]!.ratePerHour, `${id} L${i + 1} rate`).toBe(0);
        else e(rows[i]!.ratePerHour, `${id} L${i + 1} rate`).toBeGreaterThan(rows[i - 1]!.ratePerHour);
        e(rows[i]!.durationSec, `${id} L${i + 1} time`).toBeGreaterThan(rows[i - 1]!.durationSec);
      }
    }
    e(STORAGE_CAPS, "storage caps").toHaveLength(MAX_BUILDING_LEVEL);
  }

  {
    const e = ex("every upgrade cost fits in the storage cap at the HQ level that allows it");
    for (const id of BUILDING_IDS) {
      BUILDINGS[id].levels.forEach((row, i) => {
        const toLevel = i + 1;
        if (toLevel === 1) return;
        // HQ upgrades happen at HQ (toLevel - 1); others need HQ >= toLevel.
        const hqLevel = id === "hq" ? toLevel - 1 : toLevel;
        const cap = STORAGE_CAPS[hqLevel - 1]!;
        for (const r of RESOURCE_IDS) e(row.cost[r], `${id} L${toLevel} ${r}`).toBeLessThanOrEqual(cap[r]);
      });
    }
  }

  ex("support needed for HQ upgrades is produced (some source has a rate)")(BUILDINGS.hq.produces).toBe("support");
});

test("purity: rules source never reads the clock, randomness or timers", () => {
  const e = ex("rules source never reads the clock, randomness or timers");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  const src = join(import.meta.dirname, "..", "src");
  for (const f of files(src)) {
    e(readFileSync(f, "utf8"), f).not.toMatch(/Date\.now|new Date\(|Math\.random|setInterval|setTimeout|performance\.now/);
  }
});
