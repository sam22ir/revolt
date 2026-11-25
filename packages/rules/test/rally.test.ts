import { test } from "vitest";
import {
  apportion,
  isGatherOption,
  NPC_LEVELS,
  RALLY_GATHER_OPTIONS_MS,
  RALLY_SPEED,
  rallyTiming,
  resolveRally,
  seededRng,
  splitOutcome,
  TROOP_IDS,
  type MarchOutcome,
  type RallyParticipant,
  type Troops,
} from "../src/index.ts";
import { ex, MIN, T0 } from "./helpers.ts";

const t = (infantry: number, scouts = 0, heavy = 0, porters = 0): Troops => ({ infantry, scouts, heavy, porters });

test("rally timing and gather options", () => {
  {
    const e = ex("leaves when the gathering ends, at the fixed rally speed, and returns the same way");
    const gather = T0 + 5 * MIN;
    e(rallyTiming({ x: 0, y: 0 }, { x: 6, y: 8 }, gather), "timing").toEqual({
      departAt: gather,
      arriveAt: gather + (10 / RALLY_SPEED) * MIN,
      returnAt: gather + 2 * (10 / RALLY_SPEED) * MIN,
    });
    e(rallyTiming({ x: 3, y: 3 }, { x: 3, y: 3 }, gather).arriveAt, "zero distance").toBe(gather + 1000);
  }

  {
    const e = ex("only the offered gather times are valid");
    for (const g of RALLY_GATHER_OPTIONS_MS) e(isGatherOption(g), `option ${g}`).toBe(true);
    for (const bad of [0, -1, 1000, 61_000, "60000", null, Number.NaN]) e(isGatherOption(bad), `bad ${String(bad)}`).toBe(false);
  }
});

test("apportion: exact sums, proportional, ties to earlier position", () => {
  {
    const e = ex("sums exactly to the total, never negative, proportional within one unit");
    const rng = seededRng(5);
    for (let k = 0; k < 300; k++) {
      const n = 1 + Math.floor(rng() * 8);
      const weights = Array.from({ length: n }, () => Math.floor(rng() * 50));
      const total = Math.floor(rng() * 200);
      const parts = apportion(total, weights);
      const sum = weights.reduce((a, b) => a + b, 0);
      e(parts, `case ${k} length`).toHaveLength(n);
      if (sum === 0 || total === 0) {
        e(parts.every((p) => p === 0), `case ${k} zeros`).toBe(true);
        continue;
      }
      e(parts.reduce((a, b) => a + b, 0), `case ${k} sum`).toBe(total);
      parts.forEach((p, i) => {
        e(p, `case ${k} part ${i} non-negative`).toBeGreaterThanOrEqual(0);
        e(Math.abs(p - (total * weights[i]!) / sum), `case ${k} part ${i} proportional`).toBeLessThan(1);
      });
    }
  }

  {
    const e = ex("ties go to the earlier position");
    e(apportion(1, [1, 1, 1]), "1 of 3").toEqual([1, 0, 0]);
    e(apportion(2, [1, 1, 1]), "2 of 3").toEqual([1, 1, 0]);
  }
});

test("rally outcome: shares add up to the whole, order independence, solo, determinism", () => {
  {
    const e = ex("for every participant and type: survivors + wounded + lost = sent, all non-negative; totals match the whole");
    const rng = seededRng(11);
    for (let k = 0; k < 200; k++) {
      const n = 1 + Math.floor(rng() * 9);
      const parts: RallyParticipant[] = Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        troops: t(Math.floor(rng() * 40), Math.floor(rng() * 30), Math.floor(rng() * 30), Math.floor(rng() * 10)),
      }));
      const level = 1 + Math.floor(rng() * 4);
      const r = resolveRally(parts, level, Math.floor(rng() * 0xffffffff));
      const shares = splitOutcome(r.outcome, parts);
      const sum = (pick: (o: MarchOutcome) => Troops): Troops =>
        TROOP_IDS.reduce((acc, id) => ({ ...acc, [id]: shares.reduce((m, s) => m + pick(s.outcome)[id], 0) }), t(0));
      e(shares.map((s) => s.id), `case ${k} ids`).toEqual([...parts].map((p) => p.id).sort());
      for (const s of shares) {
        const sent = parts.find((p) => p.id === s.id)!.troops;
        for (const id of TROOP_IDS) {
          const o = s.outcome;
          const row = `case ${k} ${s.id} ${id}`;
          e(o.survivors[id], `${row} survivors`).toBeGreaterThanOrEqual(0);
          e(o.wounded[id], `${row} wounded`).toBeGreaterThanOrEqual(0);
          e(o.lost[id], `${row} lost`).toBeGreaterThanOrEqual(0);
          e(o.survivors[id] + o.wounded[id] + o.lost[id], `${row} conserved`).toBe(sent[id]);
        }
        e(Object.values(s.outcome.loot).every((v) => v >= 0), `case ${k} ${s.id} loot non-negative`).toBe(true);
        e(s.outcome.result, `case ${k} ${s.id} result`).toBe(r.outcome.result);
      }
      e(sum((o) => o.survivors), `case ${k} total survivors`).toEqual(r.outcome.survivors);
      e(sum((o) => o.wounded), `case ${k} total wounded`).toEqual(r.outcome.wounded);
      e(sum((o) => o.lost), `case ${k} total lost`).toEqual(r.outcome.lost);
      for (const res of ["food", "materiel", "funds", "support"] as const) {
        e(shares.reduce((m, s) => m + s.outcome.loot[res], 0), `case ${k} total loot ${res}`).toBe(r.outcome.loot[res]);
      }
    }
  }

  {
    const a: RallyParticipant = { id: "a", troops: t(7, 3) };
    const b: RallyParticipant = { id: "b", troops: t(5, 0, 4) };
    const c: RallyParticipant = { id: "c", troops: t(9, 9, 9) };
    ex("is independent of the order participants were given")(resolveRally([c, a, b], 3, 77).shares).toEqual(resolveRally([a, b, c], 3, 77).shares);
  }

  {
    const only: RallyParticipant = { id: "solo", troops: t(30, 5, 5, 4) };
    const r = resolveRally([only], 2, 9);
    ex("a single participant gets the whole outcome")(r.shares).toEqual([{ id: "solo", outcome: r.outcome }]);
  }

  {
    const parts: RallyParticipant[] = [{ id: "a", troops: t(40, 10) }, { id: "b", troops: t(30, 0, 20) }];
    ex("the same seed gives the same rally result")(resolveRally(parts, 4, 1234)).toEqual(resolveRally(parts, 4, 1234));
  }
});

test("the rally-only target: level 4 needs a rally", () => {
  const e = ex("level 4 is rally-only and too strong for a typical single column");
  const def = NPC_LEVELS[3]!;
  e(def.rallyOnly, "level 4 rallyOnly").toBe(true);
  e(NPC_LEVELS.slice(0, 3).every((d) => !d.rallyOnly), "levels 1-3 not rallyOnly").toBe(true);
  // Two players with thirty infantry each beat it together far more often than one does alone.
  let alone = 0;
  let together = 0;
  for (let seed = 0; seed < 40; seed++) {
    if (resolveRally([{ id: "a", troops: t(60, 30, 30) }], 4, seed).outcome.result === "victory") alone++;
    if (resolveRally([{ id: "a", troops: t(60, 30, 30) }, { id: "b", troops: t(60, 40, 40) }], 4, seed).outcome.result === "victory") together++;
  }
  e(together, "together beat alone").toBeGreaterThan(alone);
});
