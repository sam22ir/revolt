/**
 * Golden data for the Godot march sheet (`MarchModel`): the numbers `previewMarch` and `bonusSummary` (state/tile-info.ts,
 * state/hero-view.ts) give the send-march dialog. Travel time over distances on both sides of a `ceil` boundary and every speed mix,
 * carry capacity, the reason `checkMarch` gives (single faults and several at once, so the order is pinned), the heroes free to pick,
 * and the hero bonus. Written by `pnpm godot:export` (GODOT_EXPORT=1); otherwise the committed file is compared, so a stale file fails
 * the tests.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createBaseState, heroesFor, ZERO_TROOPS, type BackgroundId, type BaseState, type HeroId, type HeroLoadout, type Troops } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { compactJson } from "../../../packages/rules/src/export/compact-json.ts";
import { availableHeroes, bonusSummary } from "../src/state/hero-view.ts";
import { carryCapacity, previewMarch } from "../src/state/tile-info.ts";

const godot = (rel: string): URL => new URL(`../../godot/${rel}`, import.meta.url);

const troops = (t: Partial<Troops>): Troops => ({ ...ZERO_TROOPS, ...t });

const FROM = { x: 10, y: 10 };
const TARGETS = [
  { x: 10, y: 10 }, // on the camp itself: the one-second floor
  { x: 11, y: 10 },
  { x: 13, y: 14 }, // 3-4-5
  { x: 12, y: 11 }, // sqrt(5): not exact
  { x: 40, y: 22 },
  { x: 3, y: 61 },
  { x: 10, y: 10.0000001 },
];
const MIXES: Troops[] = [
  troops({}),
  troops({ infantry: 5 }),
  troops({ scouts: 5 }),
  troops({ heavy: 1 }),
  troops({ porters: 9 }),
  troops({ infantry: 3, scouts: 2 }),
  troops({ scouts: 2, heavy: 2 }),
  troops({ infantry: 1, scouts: 1, heavy: 1, porters: 1 }),
  troops({ scouts: 7, porters: 1 }),
];

const ids = (background: BackgroundId): readonly HeroId[] => heroesFor(background);

interface Scenario {
  readonly name: string;
  readonly home: Troops;
  readonly marches: number;
  readonly owned: Partial<Record<HeroId, { level: number; shards: number }>>;
  readonly busy: HeroLoadout | null;
}

const A = ids("algeria");
const own = (...heroes: [HeroId, number][]): Scenario["owned"] => Object.fromEntries(heroes.map(([id, level]) => [id, { level, shards: 0 }]));

const SCENARIOS: Scenario[] = [
  { name: "plenty", home: troops({ infantry: 20, scouts: 20, heavy: 20, porters: 20 }), marches: 0, owned: {}, busy: null },
  { name: "few", home: troops({ infantry: 2, scouts: 1, heavy: 0, porters: 3 }), marches: 0, owned: {}, busy: null },
  { name: "one_march", home: troops({ infantry: 20, scouts: 20, heavy: 20, porters: 20 }), marches: 1, owned: {}, busy: null },
  { name: "full_marches", home: troops({ infantry: 20, scouts: 20, heavy: 20, porters: 20 }), marches: 2, owned: {}, busy: null },
  { name: "three_marches", home: troops({ infantry: 20, scouts: 20, heavy: 20, porters: 20 }), marches: 3, owned: {}, busy: null },
  { name: "heroes", home: troops({ infantry: 20, scouts: 20, heavy: 20, porters: 20 }), marches: 0, owned: own([A[0]!, 1], [A[1]!, 4], [A[3]!, 10]), busy: null },
  {
    name: "heroes_one_out",
    home: troops({ infantry: 20, scouts: 20, heavy: 20, porters: 20 }),
    marches: 0,
    owned: own([A[0]!, 1], [A[1]!, 4], [A[3]!, 10]),
    busy: { lead: A[1]!, deputies: [A[3]!] },
  },
];

const LOADOUTS: (HeroLoadout | null)[] = [
  null,
  { lead: A[0]!, deputies: [] },
  { lead: A[1]!, deputies: [A[0]!] },
  { lead: A[3]!, deputies: [A[0]!, A[1]!] },
  { lead: A[3]!, deputies: [A[0]!, A[1]!, A[2]!] },
  { lead: A[0]!, deputies: [A[0]!] },
  { lead: A[2]!, deputies: [] }, // not owned
  { lead: A[0]!, deputies: [A[2]!] }, // a deputy not owned
];

const stateOf = (sc: Scenario): BaseState => {
  const base = createBaseState(0);
  const heroes = sc.busy === null ? undefined : { ...sc.busy, levels: {} };
  const marches = Array.from({ length: sc.marches }, () => ({})) as unknown as BaseState["marches"];
  const busyMarch = heroes === undefined ? [] : ([{ heroes }] as unknown as BaseState["marches"]);
  return { ...base, troops: sc.home, heroes: { owned: sc.owned, pity: 0 }, marches: [...marches, ...busyMarch] } as BaseState;
};

const sendable: Troops[] = [troops({ infantry: 1 }), troops({ scouts: 3 }), troops({ porters: 2 }), troops({ infantry: 3, heavy: 2 }), troops({ infantry: 25 }), troops({ scouts: 21, heavy: 1 }), troops({})];

const buildFixtures = (): unknown => ({
  travel: TARGETS.flatMap((to) => MIXES.map((t) => ({ from: FROM, to, troops: t, travel_ms: previewMarch(createBaseState(0), FROM, to, t).travelMs, carry: carryCapacity(t) }))),
  checks: SCENARIOS.flatMap((sc) =>
    sendable.flatMap((t) =>
      LOADOUTS.map((loadout) => ({
        scenario: sc.name,
        home: sc.home,
        marches: sc.marches + (sc.busy === null ? 0 : 1),
        owned: sc.owned,
        busy: sc.busy,
        troops: t,
        loadout,
        reason: previewMarch(stateOf(sc), FROM, { x: 12, y: 11 }, t, loadout).reason,
      })),
    ),
  ),
  available: (["algeria", "vietnam"] as const).flatMap((background) =>
    SCENARIOS.map((sc) => {
      const owned = sc.name === "plenty" ? {} : Object.fromEntries(ids(background).slice(0, 3).map((id, i) => [id, { level: i + 1, shards: 0 }]));
      const busy = sc.busy === null ? null : { lead: ids(background)[1]!, deputies: [ids(background)[2]!] };
      const state = stateOf({ ...sc, owned, busy });
      return { background, scenario: sc.name, owned, busy, heroes: availableHeroes(state, background) };
    }),
  ),
  bonus: ids("algeria").concat(ids("vietnam")).flatMap((lead) =>
    [1, 3, 10].map((level) => {
      const background: BackgroundId = (ids("algeria") as readonly HeroId[]).includes(lead) ? "algeria" : "vietnam";
      const others = ids(background).filter((id) => id !== lead);
      const owned = Object.fromEntries([lead, ...others].map((id) => [id, { level, shards: 0 }]));
      const state = { ...createBaseState(0), heroes: { owned, pity: 0 } } as BaseState;
      const loadout = { lead, deputies: others.slice(0, 2) };
      return { background, lead, level, loadout, solo: bonusSummary(state, { lead, deputies: [] }), squad: bonusSummary(state, loadout) };
    }),
  ),
});

describe("Godot march fixtures", () => {
  test("data/march-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    const fixtures = buildFixtures();
    if (process.env.GODOT_EXPORT === "1") {
      writeFileSync(godot("data/march-fixtures.json"), `${compactJson(fixtures)}\n`);
      return;
    }
    const committed = JSON.parse(readFileSync(godot("data/march-fixtures.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(fixtures)));
  });
});
