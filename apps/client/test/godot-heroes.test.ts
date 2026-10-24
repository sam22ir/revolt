/**
 * Golden data for the Godot Heroes screen (`HeroesModel`): the cards `heroCards` (state/hero-view.ts) builds from a base, for both
 * backgrounds, hero hall levels 1, 2 and 5, heroes not recruited, at level 1 with too few and enough shards, at the hall's cap and at
 * the top level, and busy on a march as the lead or as a deputy. Written by `pnpm godot:export` (GODOT_EXPORT=1); otherwise the
 * committed file is compared, so a stale file fails the tests.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createBaseState, HEROES, heroesFor, MAX_HERO_LEVEL, type BackgroundId, type BaseState, type HeroEntry, type HeroId } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { compactJson } from "../../../packages/rules/src/export/compact-json.ts";
import { heroCards, skillPct } from "../src/state/hero-view.ts";

const godot = (rel: string): URL => new URL(`../../godot/${rel}`, import.meta.url);

const BACKGROUNDS: BackgroundId[] = ["algeria", "vietnam"];
const HALLS = [1, 2, 5];

interface Scenario {
  readonly name: string;
  readonly owned: (ids: readonly HeroId[]) => Partial<Record<HeroId, HeroEntry>>;
  readonly march?: (ids: readonly HeroId[]) => { lead: HeroId; deputies: HeroId[] };
}

const SCENARIOS: Scenario[] = [
  { name: "none", owned: () => ({}) },
  { name: "level1_no_shards", owned: (ids) => ({ [ids[3]!]: { level: 1, shards: 0 } }) },
  { name: "level1_two_shards", owned: (ids) => ({ [ids[3]!]: { level: 1, shards: 2 }, [ids[0]!]: { level: 1, shards: 1 } }) },
  { name: "level2_cap_edge", owned: (ids) => ({ [ids[1]!]: { level: 2, shards: 99 } }) },
  { name: "level4_cap_edge", owned: (ids) => ({ [ids[2]!]: { level: 4, shards: 99 } }) },
  { name: "level10", owned: (ids) => ({ [ids[3]!]: { level: 10, shards: 5 } }) },
  {
    name: "busy_lead_and_deputy",
    owned: (ids) => ({ [ids[3]!]: { level: 1, shards: 9 }, [ids[1]!]: { level: 1, shards: 9 }, [ids[0]!]: { level: 1, shards: 0 } }),
    march: (ids) => ({ lead: ids[3]!, deputies: [ids[1]!] }),
  },
];

const stateOf = (background: BackgroundId, hall: number, sc: Scenario): BaseState => {
  const ids = heroesFor(background);
  const base = createBaseState(0);
  const marchHeroes = sc.march === undefined ? undefined : { ...sc.march(ids), levels: {} };
  return {
    ...base,
    levels: { ...base.levels, hero_hall: hall },
    heroes: { owned: sc.owned(ids), pity: 0 },
    marches: marchHeroes === undefined ? [] : ([{ heroes: marchHeroes }] as unknown as BaseState["marches"]),
  } as BaseState;
};

/** A skill's value in whole percent at a level, from the client's own `skillPct` (what `skillLine` in ui/heroes-panel.ts shows). */
const skillPcts = (): unknown[] =>
  heroesFor("algeria").concat(heroesFor("vietnam")).flatMap((id) =>
    Array.from({ length: MAX_HERO_LEVEL }, (_, i) => i + 1).map((level) => ({
      hero: id,
      level,
      command: skillPct(HEROES[id].command.value, level),
      passives: HEROES[id].passives.map((p) => skillPct(p.value, level)),
    })),
  );

const buildFixtures = (): unknown => ({
  skill_pcts: skillPcts(),
  cases: BACKGROUNDS.flatMap((background) =>
    HALLS.flatMap((hall) =>
      SCENARIOS.map((sc) => ({
        background,
        hall,
        scenario: sc.name,
        owned: sc.owned(heroesFor(background)),
        marching: sc.march === undefined ? [] : [sc.march(heroesFor(background)).lead, ...sc.march(heroesFor(background)).deputies],
        cards: heroCards(stateOf(background, hall, sc), background).map((c) => ({
          id: c.id,
          owned: c.owned,
          busy: c.busy,
          level_up: c.levelUp,
          next_shards: c.nextShards,
          cap: c.cap,
        })),
      })),
    ),
  ),
});

describe("Godot heroes fixtures", () => {
  test("data/heroes-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    const fixtures = buildFixtures();
    if (process.env.GODOT_EXPORT === "1") {
      writeFileSync(godot("data/heroes-fixtures.json"), `${compactJson(fixtures)}\n`);
      return;
    }
    const committed = JSON.parse(readFileSync(godot("data/heroes-fixtures.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(fixtures)));
  });
});
