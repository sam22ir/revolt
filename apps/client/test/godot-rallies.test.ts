/**
 * Golden data for the Godot rallies (`RallyModel`): `canJoinRally` (ui/alliance-rallies.ts) over gathering, closed, full and joined
 * rallies, and the one-way leg `rallyTiming` (rules/rally.ts) gives a rally started from a camp, at the fixed rally speed, including
 * distances on both sides of a `ceil` boundary and none at all (the one-second floor). Written by `pnpm godot:export`
 * (GODOT_EXPORT=1); otherwise the committed file is compared, so a stale file fails the tests.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { rallyTiming, type RallyView } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { compactJson } from "../../../packages/rules/src/export/compact-json.ts";
import { canJoinRally } from "../src/ui/alliance-rallies.ts";

const godot = (rel: string): URL => new URL(`../../godot/${rel}`, import.meta.url);

const T0 = 1_700_000_000_000;

const rally = (over: Partial<RallyView>): RallyView =>
  ({ id: "r", leader: "L", target: { npcId: "n", kind: "patrol", level: 1, x: 5, y: 5 }, gatherUntil: T0 + 60_000, arriveAt: T0 + 120_000, returnAt: T0 + 180_000, participants: 2, maxParticipants: 5, joined: false, ...over }) as RallyView;

const buildFixtures = (): unknown => ({
  joins: [
    { name: "open", r: rally({}) },
    { name: "joined", r: rally({ joined: true }) },
    { name: "full", r: rally({ participants: 5 }) },
    { name: "one_short", r: rally({ participants: 4 }) },
    { name: "over_full", r: rally({ participants: 6 }) },
    { name: "alone_empty", r: rally({ participants: 0 }) },
  ].flatMap(({ name, r }) =>
    [T0 - 1, T0, T0 + 59_999, T0 + 60_000, T0 + 60_001, T0 + 500_000].map((now) => ({ name, rally: r, now, can_join: canJoinRally(r, now) })),
  ),
  legs: [
    [{ x: 43, y: 54 }, { x: 32, y: 53 }],
    [{ x: 10, y: 10 }, { x: 10, y: 10 }],
    [{ x: 10, y: 10 }, { x: 10, y: 11 }],
    [{ x: 0, y: 0 }, { x: 63, y: 63 }],
    [{ x: 3, y: 4 }, { x: 8, y: 16 }],
    [{ x: 20, y: 20 }, { x: 20.0000001, y: 20 }],
  ].map(([from, to]) => ({ from, to, leg_ms: rallyTiming(from!, to!, 0).arriveAt })),
});

describe("Godot rallies fixtures", () => {
  test("data/rallies-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    const fixtures = buildFixtures();
    if (process.env.GODOT_EXPORT === "1") {
      writeFileSync(godot("data/rallies-fixtures.json"), `${compactJson(fixtures)}\n`);
      return;
    }
    const committed = JSON.parse(readFileSync(godot("data/rallies-fixtures.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(fixtures)));
  });
});
