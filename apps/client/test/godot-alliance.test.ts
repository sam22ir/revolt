/**
 * Golden data for the Godot alliance members tab: which of the four member actions (`memberActions` in
 * `ui/alliance-members.ts`) each viewer rank is offered on each member, for every viewer rank, member rank and the viewer's own
 * row. Written by `pnpm godot:export` (GODOT_EXPORT=1); otherwise the committed file is compared, so a stale file fails the tests.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ALLIANCE_RANKS } from "@revolt/rules";
import { compactJson } from "../../../packages/rules/src/export/compact-json.ts";
import { memberActions } from "../src/ui/alliance-members.ts";

const godot = (rel: string): URL => new URL(`../../godot/${rel}`, import.meta.url);

const buildFixtures = (): unknown => ({
  member_actions: ALLIANCE_RANKS.flatMap((viewer) =>
    ALLIANCE_RANKS.flatMap((rank) =>
      [false, true].map((me) => ({
        viewer,
        rank,
        me,
        actions: memberActions(viewer, { handle: "x", rank, joinedAt: 0, me }),
      })),
    ),
  ),
});

describe("Godot alliance fixtures", () => {
  test("data/alliance-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    const fixtures = buildFixtures();
    if (process.env.GODOT_EXPORT === "1") {
      writeFileSync(godot("data/alliance-fixtures.json"), `${compactJson(fixtures)}\n`);
      return;
    }
    const committed = JSON.parse(readFileSync(godot("data/alliance-fixtures.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(fixtures)));
  });
});
