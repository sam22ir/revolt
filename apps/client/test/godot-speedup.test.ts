/**
 * Golden data for the Godot speed-up button (`SpeedupModel`): the reason the real `speedUp` (packages/rules/src/store.ts) gives for
 * spending one token, for every combination of job kind, job state (none, already ended, running), headquarters or another
 * building, tokens held, and speed-up time used today (none, one minute short of the cap, the cap). Only `ok` and `reason` are
 * written: the time one token removes and whether `reduceJob` changes the job stay with the server. Written by `pnpm godot:export`
 * (GODOT_EXPORT=1); otherwise the committed file is compared, so a stale file fails the tests.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createBaseState, NO_WORLD, speedUp, SPEEDUP_DAILY_CAP_MS, type BaseState, type HelpKind } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { compactJson } from "../../../packages/rules/src/export/compact-json.ts";

const godot = (rel: string): URL => new URL(`../../godot/${rel}`, import.meta.url);

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

type JobState = "none" | "ended" | "running";

const stateOf = (kind: HelpKind, job: JobState, building: string): BaseState => {
  const base = createBaseState(NOW - 1000);
  if (job === "none") return base;
  const endsAt = job === "ended" ? NOW - 1 : NOW + 2 * HOUR;
  const startedAt = NOW - 1000 - HOUR;
  return kind === "upgrade"
    ? ({ ...base, queue: { building, toLevel: 2, startedAt, endsAt } } as unknown as BaseState)
    : ({ ...base, training: { troop: "infantry", count: 5, startedAt, endsAt } } as unknown as BaseState);
};

const buildFixtures = (): unknown => ({
  cases: (["upgrade", "training"] as const).flatMap((kind) =>
    (["none", "ended", "running"] as const).flatMap((job) =>
      (kind === "upgrade" ? ["hq", "farm"] : ["barracks"]).flatMap((building) =>
        [0, 1].flatMap((held) =>
          [0, SPEEDUP_DAILY_CAP_MS - 60_000, SPEEDUP_DAILY_CAP_MS].map((used) => {
            const r = speedUp(stateOf(kind, job, building), kind, 1, held, used, NOW, NO_WORLD);
            return { kind, job, building, held, used, cap: SPEEDUP_DAILY_CAP_MS, now: NOW, ok: r.ok, reason: r.ok ? "" : r.reason };
          }),
        ),
      ),
    ),
  ),
});

describe("Godot speed-up fixtures", () => {
  test("data/speedup-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    const fixtures = buildFixtures();
    if (process.env.GODOT_EXPORT === "1") {
      writeFileSync(godot("data/speedup-fixtures.json"), `${compactJson(fixtures)}\n`);
      return;
    }
    const committed = JSON.parse(readFileSync(godot("data/speedup-fixtures.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(fixtures)));
  });
});
