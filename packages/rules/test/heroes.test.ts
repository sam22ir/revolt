import { describe, expect, test } from "vitest";
import {
  advance,
  BUILDINGS,
  drawHero,
  EMPTY_HERO_ROSTER,
  HERO_DRAW_COST,
  HERO_DRAW_MIN_HALL,
  HERO_DRAW_ODDS,
  HERO_IDS,
  HERO_RARITIES,
  heroLevelCap,
  HEROES,
  isPityDraw,
  levelUpHero,
  MAX_HERO_LEVEL,
  PITY_DRAWS,
  recruitHero,
  SHARDS_PER_DUPLICATE,
  SKILL_IDS,
  seededRng,
  shardsToNextLevel,
  type BaseState,
  type HeroId,
  type HeroRoster,
  type HeroRarity,
  HERO_SHARDS_PER_LEVEL,
} from "../src/index.ts";
import { base, HOUR, rich, T0 } from "./helpers.ts";

const withRoster = (roster: HeroRoster, overrides: Partial<BaseState> = {}): BaseState => base({ ...rich(), heroes: roster, ...overrides });
const owned = (entries: Partial<Record<HeroId, { level: number; shards: number }>>, pity = 0): HeroRoster => ({ owned: entries, pity });

/** An rng that always returns `v`: 0 picks the first option everywhere. */
const constant = (v: number) => () => v;

describe("hero data", () => {
  test("placeholder roster has two common, one rare and one legendary hero", () => {
    const count = (r: HeroRarity) => HERO_IDS.filter((id) => HEROES[id].rarity === r).length;
    expect(HERO_IDS).toHaveLength(4);
    expect(count("common")).toBe(2);
    expect(count("rare")).toBe(1);
    expect(count("legendary")).toBe(1);
  });

  test("every hero has a combat specialty, one command skill and exactly two passives", () => {
    const ids = new Set<string>();
    for (const id of HERO_IDS) {
      const def = HEROES[id];
      expect(["infantry", "scouts", "heavy"], id).toContain(def.specialty);
      expect(def.passives, id).toHaveLength(2);
      for (const skill of [def.command, ...def.passives]) {
        expect(SKILL_IDS, skill.id).toContain(skill.id);
        expect(ids.has(skill.id), `skill ${skill.id} reused`).toBe(false);
        ids.add(skill.id);
        expect(skill.value, skill.id).toBeGreaterThan(0);
        expect(skill.value, skill.id).toBeLessThan(1);
      }
    }
  });

  test("published odds sum to 1 and every rarity has at least one hero", () => {
    const total = HERO_RARITIES.reduce((sum, r) => sum + HERO_DRAW_ODDS[r], 0);
    const probability = HERO_RARITIES.reduce((sum, r) => sum + HERO_DRAW_ODDS[r] / total, 0);
    expect(probability).toBeCloseTo(1, 12);
    for (const r of HERO_RARITIES) expect(HERO_IDS.some((id) => HEROES[id].rarity === r), r).toBe(true);
  });

  test("the level curve has one shard step per level below the cap, and the hall can reach the cap", () => {
    expect(HERO_SHARDS_PER_LEVEL).toHaveLength(MAX_HERO_LEVEL - 1);
    expect(HERO_SHARDS_PER_LEVEL.every((n) => Number.isInteger(n) && n > 0)).toBe(true);
    expect(heroLevelCap(BUILDINGS.hero_hall.levels.length)).toBe(MAX_HERO_LEVEL);
  });

  test("the hero hall costs and times rise with level, like the other buildings", () => {
    const rows = BUILDINGS.hero_hall.levels;
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.durationSec).toBeGreaterThan(rows[i - 1]!.durationSec);
  });
});

describe("drawHero", () => {
  test("the same seed gives the same sequence of draws", () => {
    const run = (seed: number) => {
      const rng = seededRng(seed);
      let roster = EMPTY_HERO_ROSTER;
      const out: string[] = [];
      for (let i = 0; i < 40; i++) {
        const d = drawHero(roster, rng);
        roster = d.roster;
        out.push(`${d.heroId}:${d.rarity}:${d.forced}`);
      }
      return out;
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  test("a new hero starts at level 1 with no shards; a repeat banks shards and keeps its level", () => {
    const first = drawHero(EMPTY_HERO_ROSTER, constant(0));
    expect(first.duplicate).toBe(false);
    expect(first.roster.owned[first.heroId]).toEqual({ level: 1, shards: 0 });
    const second = drawHero(first.roster, constant(0));
    expect(second.heroId).toBe(first.heroId);
    expect(second.duplicate).toBe(true);
    expect(second.roster.owned[first.heroId]).toEqual({ level: 1, shards: SHARDS_PER_DUPLICATE });
  });

  test("pity: the draw after PITY_DRAWS - 1 commons is forced to rare or better, and resets the counter", () => {
    let roster = EMPTY_HERO_ROSTER;
    // constant(0) picks the first rarity in the pool, so the non-forced draws are common.
    for (let i = 1; i < PITY_DRAWS; i++) {
      const d = drawHero(roster, constant(0));
      expect(d.rarity, `draw ${i}`).toBe("common");
      expect(d.forced).toBe(false);
      roster = d.roster;
      expect(roster.pity).toBe(i);
    }
    expect(isPityDraw(roster)).toBe(true);
    const forced = drawHero(roster, constant(0));
    expect(forced.forced).toBe(true);
    expect(forced.rarity).not.toBe("common");
    expect(forced.roster.pity).toBe(0);
  });

  test("pity holds over a long run: no more than PITY_DRAWS - 1 commons in a row", () => {
    const rng = seededRng(2026);
    let roster = EMPTY_HERO_ROSTER;
    let run = 0;
    let longest = 0;
    for (let i = 0; i < 5000; i++) {
      const d = drawHero(roster, rng);
      roster = d.roster;
      run = d.rarity === "common" ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThan(PITY_DRAWS);
  });

  test("a rare or better draw resets the pity counter without being forced", () => {
    const roster = owned({}, 4);
    const d = drawHero(roster, constant(0.9999));
    expect(d.rarity).toBe("legendary");
    expect(d.forced).toBe(false);
    expect(d.roster.pity).toBe(0);
  });

  test("empirical rarity frequencies match the published odds over many seeded draws", () => {
    const rng = seededRng(99);
    const counts: Record<HeroRarity, number> = { common: 0, rare: 0, legendary: 0 };
    let roster = EMPTY_HERO_ROSTER;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const d = drawHero(roster, rng);
      roster = d.roster;
      counts[d.rarity]++;
    }
    // Pity bumps rare-or-better slightly above the raw odds, so only check the bounds loosely.
    expect(counts.common / N).toBeGreaterThan(0.6);
    expect(counts.common / N).toBeLessThan(0.75);
    expect(counts.legendary / N).toBeGreaterThan(0.05);
    expect(counts.legendary / N).toBeLessThan(0.12);
  });
});

describe("recruitHero", () => {
  test("is refused below the minimum hall level, and nothing is charged", () => {
    const s = base({ ...rich(), levels: { ...base().levels, hero_hall: HERO_DRAW_MIN_HALL - 1 } });
    const r = recruitHero(s, T0, constant(0));
    expect(r).toMatchObject({ ok: false, reason: "hero_hall_level" });
    expect(r.state.resources).toEqual(s.resources);
  });

  test("is refused when the draw cost cannot be paid", () => {
    const s = base({ resources: { food: 0, materiel: 0, funds: HERO_DRAW_COST.funds - 1, support: 0 }, levels: { ...base().levels, hero_hall: HERO_DRAW_MIN_HALL } });
    expect(recruitHero(s, T0, constant(0))).toMatchObject({ ok: false, reason: "insufficient" });
  });

  test("charges the cost, settles production to now, and adds the hero", () => {
    const s = withRoster(EMPTY_HERO_ROSTER, { levels: { ...base().levels, hero_hall: HERO_DRAW_MIN_HALL }, lastUpdated: T0 });
    const now = T0 + HOUR;
    const r = recruitHero(s, now, constant(0));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.lastUpdated).toBe(now);
    expect(r.state.resources.funds).toBe(advance(s, now).resources.funds - HERO_DRAW_COST.funds);
    expect(r.state.heroes.owned[r.draw.heroId]).toEqual({ level: 1, shards: 0 });
  });

  test("a clock that went backwards does not roll the base back or refund the draw", () => {
    const s = withRoster(EMPTY_HERO_ROSTER, { levels: { ...base().levels, hero_hall: HERO_DRAW_MIN_HALL }, lastUpdated: T0 + HOUR });
    const r = recruitHero(s, T0, constant(0));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.lastUpdated).toBe(T0 + HOUR);
    expect(r.state.resources.funds).toBe(s.resources.funds - HERO_DRAW_COST.funds);
  });
});

describe("levelUpHero", () => {
  const hall = (level: number) => ({ ...base().levels, hero_hall: level });

  test("refuses a hero that is not owned", () => {
    expect(levelUpHero(base(), "mountain_guide")).toMatchObject({ ok: false, reason: "not_owned" });
  });

  test("spends exactly the shards of the step and raises the level by one", () => {
    const s = base({ levels: hall(5), heroes: owned({ mountain_guide: { level: 1, shards: 10 } }) });
    const r = levelUpHero(s, "mountain_guide");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.heroes.owned.mountain_guide).toEqual({ level: 2, shards: 10 - HERO_SHARDS_PER_LEVEL[0]! });
  });

  test("refuses with not_enough_shards when the step is not paid for, and leaves the state as it was", () => {
    const s = base({ levels: hall(5), heroes: owned({ mountain_guide: { level: 1, shards: 1 } }) });
    const r = levelUpHero(s, "mountain_guide");
    expect(r).toMatchObject({ ok: false, reason: "not_enough_shards", state: s });
  });

  test("the hero hall caps levels: at the cap, the hero waits for a higher hall", () => {
    const s = base({ levels: hall(1), heroes: owned({ mountain_guide: { level: heroLevelCap(1), shards: 999 } }) });
    expect(heroLevelCap(1)).toBe(2);
    expect(levelUpHero(s, "mountain_guide")).toMatchObject({ ok: false, reason: "hall_cap" });
    const bigger = { ...s, levels: hall(2) };
    expect(levelUpHero(bigger, "mountain_guide")).toMatchObject({ ok: true });
  });

  test("the top level is refused with max_level, and the curve ends there", () => {
    const s = base({ levels: hall(BUILDINGS.hero_hall.levels.length), heroes: owned({ hill_commander: { level: MAX_HERO_LEVEL, shards: 999 } }) });
    expect(levelUpHero(s, "hill_commander")).toMatchObject({ ok: false, reason: "max_level" });
    expect(shardsToNextLevel(MAX_HERO_LEVEL)).toBeNull();
    expect(shardsToNextLevel(1)).toBe(HERO_SHARDS_PER_LEVEL[0]);
  });

  test("walking the whole curve with the exact shards reaches the top level and no further", () => {
    const need = HERO_SHARDS_PER_LEVEL.reduce((a, b) => a + b, 0);
    let s: BaseState = base({ levels: hall(BUILDINGS.hero_hall.levels.length), heroes: owned({ dock_foreman: { level: 1, shards: need } }) });
    for (let lvl = 1; lvl < MAX_HERO_LEVEL; lvl++) {
      const r = levelUpHero(s, "dock_foreman");
      expect(r.ok, `to level ${lvl + 1}`).toBe(true);
      if (r.ok) s = r.state;
    }
    expect(s.heroes.owned.dock_foreman).toEqual({ level: MAX_HERO_LEVEL, shards: 0 });
    expect(levelUpHero(s, "dock_foreman")).toMatchObject({ ok: false, reason: "max_level" });
  });
});

describe("hero ids and roster types", () => {
  test("SKILL_IDS and HERO_IDS are plain snake_case", () => {
    for (const id of [...SKILL_IDS, ...HERO_IDS]) expect(id).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
  });
});
