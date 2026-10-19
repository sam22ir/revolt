import { describe, expect, test } from "vitest";
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
import { MIN, T0 } from "./helpers.ts";

const t = (infantry: number, scouts = 0, heavy = 0, porters = 0): Troops => ({ infantry, scouts, heavy, porters });

describe("rallyTiming", () => {
  test("leaves when the gathering ends, at the fixed rally speed, and returns the same way", () => {
    const gather = T0 + 5 * MIN;
    const x = rallyTiming({ x: 0, y: 0 }, { x: 6, y: 8 }, gather);
    expect(x).toEqual({ departAt: gather, arriveAt: gather + (10 / RALLY_SPEED) * MIN, returnAt: gather + 2 * (10 / RALLY_SPEED) * MIN });
    expect(rallyTiming({ x: 3, y: 3 }, { x: 3, y: 3 }, gather).arriveAt).toBe(gather + 1000);
  });

  test("only the offered gather times are valid", () => {
    for (const g of RALLY_GATHER_OPTIONS_MS) expect(isGatherOption(g)).toBe(true);
    for (const bad of [0, -1, 1000, 61_000, "60000", null, Number.NaN]) expect(isGatherOption(bad), String(bad)).toBe(false);
  });
});

describe("apportion", () => {
  test("sums exactly to the total, never negative, proportional within one unit", () => {
    const rng = seededRng(5);
    for (let k = 0; k < 300; k++) {
      const n = 1 + Math.floor(rng() * 8);
      const weights = Array.from({ length: n }, () => Math.floor(rng() * 50));
      const total = Math.floor(rng() * 200);
      const parts = apportion(total, weights);
      const sum = weights.reduce((a, b) => a + b, 0);
      expect(parts).toHaveLength(n);
      if (sum === 0 || total === 0) {
        expect(parts.every((p) => p === 0)).toBe(true);
        continue;
      }
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      parts.forEach((p, i) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(Math.abs(p - (total * weights[i]!) / sum)).toBeLessThan(1);
      });
    }
  });

  test("ties go to the earlier position", () => {
    expect(apportion(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(apportion(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });
});

describe("splitOutcome", () => {
  const whole = (parts: readonly RallyParticipant[], outcome: MarchOutcome) => {
    const shares = splitOutcome(outcome, parts);
    const sum = (pick: (o: MarchOutcome) => Troops): Troops =>
      TROOP_IDS.reduce((acc, id) => ({ ...acc, [id]: shares.reduce((n, s) => n + pick(s.outcome)[id], 0) }), t(0));
    return { shares, sum };
  };

  test("for every participant and type: survivors + wounded + lost = sent, all non-negative; totals match the whole", () => {
    const rng = seededRng(11);
    for (let k = 0; k < 200; k++) {
      const n = 1 + Math.floor(rng() * 9);
      const parts: RallyParticipant[] = Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        troops: t(Math.floor(rng() * 40), Math.floor(rng() * 30), Math.floor(rng() * 30), Math.floor(rng() * 10)),
      }));
      const level = 1 + Math.floor(rng() * 4);
      const r = resolveRally(parts, level, Math.floor(rng() * 0xffffffff));
      const { shares, sum } = whole(parts, r.outcome);
      expect(shares.map((s) => s.id)).toEqual([...parts].map((p) => p.id).sort());
      for (const s of shares) {
        const sent = parts.find((p) => p.id === s.id)!.troops;
        for (const id of TROOP_IDS) {
          const o = s.outcome;
          expect(o.survivors[id]).toBeGreaterThanOrEqual(0);
          expect(o.wounded[id]).toBeGreaterThanOrEqual(0);
          expect(o.lost[id]).toBeGreaterThanOrEqual(0);
          expect(o.survivors[id] + o.wounded[id] + o.lost[id]).toBe(sent[id]);
        }
        expect(Object.values(s.outcome.loot).every((v) => v >= 0)).toBe(true);
        expect(s.outcome.result).toBe(r.outcome.result);
      }
      expect(sum((o) => o.survivors)).toEqual(r.outcome.survivors);
      expect(sum((o) => o.wounded)).toEqual(r.outcome.wounded);
      expect(sum((o) => o.lost)).toEqual(r.outcome.lost);
      for (const res of ["food", "materiel", "funds", "support"] as const) {
        expect(shares.reduce((n, s) => n + s.outcome.loot[res], 0)).toBe(r.outcome.loot[res]);
      }
    }
  });

  test("is independent of the order participants were given", () => {
    const a: RallyParticipant = { id: "a", troops: t(7, 3) };
    const b: RallyParticipant = { id: "b", troops: t(5, 0, 4) };
    const c: RallyParticipant = { id: "c", troops: t(9, 9, 9) };
    const r1 = resolveRally([a, b, c], 3, 77);
    const r2 = resolveRally([c, a, b], 3, 77);
    expect(r2.shares).toEqual(r1.shares);
  });

  test("a single participant gets the whole outcome", () => {
    const only: RallyParticipant = { id: "solo", troops: t(30, 5, 5, 4) };
    const r = resolveRally([only], 2, 9);
    expect(r.shares).toEqual([{ id: "solo", outcome: r.outcome }]);
  });

  test("the same seed gives the same rally result", () => {
    const parts: RallyParticipant[] = [{ id: "a", troops: t(40, 10) }, { id: "b", troops: t(30, 0, 20) }];
    expect(resolveRally(parts, 4, 1234)).toEqual(resolveRally(parts, 4, 1234));
  });
});

describe("the rally-only target", () => {
  test("level 4 is rally-only and too strong for a typical single column", () => {
    const def = NPC_LEVELS[3]!;
    expect(def.rallyOnly).toBe(true);
    expect(NPC_LEVELS.slice(0, 3).every((d) => !d.rallyOnly)).toBe(true);
    // Two players with thirty infantry each beat it together far more often than one does alone.
    let alone = 0;
    let together = 0;
    for (let seed = 0; seed < 40; seed++) {
      if (resolveRally([{ id: "a", troops: t(60, 30, 30) }], 4, seed).outcome.result === "victory") alone++;
      if (resolveRally([{ id: "a", troops: t(60, 30, 30) }, { id: "b", troops: t(60, 40, 40) }], 4, seed).outcome.result === "victory") together++;
    }
    expect(together).toBeGreaterThan(alone);
  });
});
