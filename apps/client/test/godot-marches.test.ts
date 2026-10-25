/**
 * Golden data for the Godot marches list and moving markers (`MarchesModel`): the stage `marchStage` (ui/marches-list.ts) gives a
 * march of the player's base and the leg and position `marchPosition` (scene/world-layout.ts) gives a march on the map, at times
 * before, on and between every timestamp, for a solo march, a rally's march (gathering until it departs) and one that has a result.
 * Written by `pnpm godot:export` (GODOT_EXPORT=1); otherwise the committed file is compared, so a stale file fails the tests.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { MarchState } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { compactJson } from "../../../packages/rules/src/export/compact-json.ts";
import { marchStage } from "../src/ui/marches-list.ts";
import { marchPosition } from "../src/scene/world-layout.ts";

const godot = (rel: string): URL => new URL(`../../godot/${rel}`, import.meta.url);

const T0 = 1_700_000_000_000;
const ROUTES = [
  { from: { x: 43, y: 54 }, to: { x: 32, y: 53 } },
  { from: { x: 3, y: 4 }, to: { x: 60, y: 7 } },
  { from: { x: 10, y: 10 }, to: { x: 10, y: 10 } }, // a zero-length route
];
/** [departAt, arriveAt, returnAt] offsets: a normal march, a rally that leaves later, a one-second leg and an empty leg. */
const TIMINGS = [
  [0, 330_000, 660_000],
  [120_000, 450_000, 780_000],
  [0, 1000, 2000],
  [0, 0, 0],
];

const marches = ROUTES.flatMap((r, i) =>
  TIMINGS.map((t, j) => ({ id: `m${i}${j}`, mine: true, ...r, departAt: T0 + t[0]!, arriveAt: T0 + t[1]!, returnAt: T0 + t[2]! })),
);

const nowsOf = (m: { departAt: number; arriveAt: number; returnAt: number }): number[] => {
  const marks = [m.departAt, m.arriveAt, m.returnAt];
  return [...new Set([T0 - 5000, ...marks, ...marks.map((x) => x - 1), ...marks.map((x) => x + 1), (m.departAt + m.arriveAt) / 2, (m.arriveAt + m.returnAt) / 2, m.returnAt + 99_999])].sort((a, b) => a - b);
};

const buildFixtures = (): unknown => ({
  positions: marches.flatMap((m) =>
    nowsOf(m).map((now) => {
      const p = marchPosition(m, now);
      return { march: m, now, leg: p.leg, x: p.at.x, y: p.at.y };
    }),
  ),
  stages: marches.flatMap((m) =>
    [false, true].flatMap((rally) =>
      [null, "victory"].flatMap((result) =>
        nowsOf(m).map((now) => {
          const state = { id: m.id, departAt: m.departAt, arriveAt: m.arriveAt, returnAt: m.returnAt, ...(rally ? { rallyId: "r" } : {}), outcome: result === null ? null : { result } } as unknown as MarchState;
          return { departAt: m.departAt, arriveAt: m.arriveAt, returnAt: m.returnAt, rally, result, now, stage: marchStage(state, now) };
        }),
      ),
    ),
  ),
});

describe("Godot marches fixtures", () => {
  test("data/marches-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    const fixtures = buildFixtures();
    if (process.env.GODOT_EXPORT === "1") {
      writeFileSync(godot("data/marches-fixtures.json"), `${compactJson(fixtures)}\n`);
      return;
    }
    const committed = JSON.parse(readFileSync(godot("data/marches-fixtures.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(fixtures)));
  });
});
