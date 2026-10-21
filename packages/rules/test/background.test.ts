import { describe, expect, test } from "vitest";
import {
  advance,
  BACKGROUND_IDS,
  BACKGROUND_SERVER,
  backgroundOfServer,
  BUILDING_IDS,
  chapterStatus,
  chaptersFor,
  claimChapter,
  createBaseState,
  drawHero,
  HERO_DRAW_COST,
  currentChapter,
  DEFAULT_BACKGROUND,
  HERO_IDS,
  HEROES,
  HEROES_BY_BACKGROUND,
  heroesFor,
  isBackgroundId,
  isBaseState,
  migrateBaseState,
  serverFor,
  startUpgrade,
  STORY,
  type BackgroundId,
  type BaseState,
} from "../src/index.ts";
import { base, DAY, SEC, T0, withHeroes } from "./helpers.ts";

describe("background ids and servers", () => {
  test("the server round trip is exact and the servers differ", () => {
    for (const bg of BACKGROUND_IDS) expect(backgroundOfServer(serverFor(bg))).toBe(bg);
    const servers = BACKGROUND_IDS.map(serverFor);
    expect(new Set(servers).size).toBe(BACKGROUND_IDS.length);
    expect(BACKGROUND_SERVER).toEqual({ algeria: "algeria-1", vietnam: "vietnam-1" });
  });

  test("a later server of a background still belongs to it", () => {
    expect(backgroundOfServer("vietnam-2")).toBe("vietnam");
    expect(backgroundOfServer("algeria-12")).toBe("algeria");
  });

  test("unknown servers and ids are rejected", () => {
    for (const s of ["", "mars-1", "vietnam", "vietnam-0", "vietnam-1x", "Vietnam-1", "algeria-1 "]) expect(() => backgroundOfServer(s), s).toThrow();
    for (const v of ["", "Vietnam", "mars", null, undefined, 3, {}]) expect(isBackgroundId(v), String(v)).toBe(false);
    for (const bg of BACKGROUND_IDS) expect(isBackgroundId(bg)).toBe(true);
    expect(DEFAULT_BACKGROUND).toBe("algeria");
  });
});

describe("hero rosters", () => {
  test("every hero id has a definition and belongs to exactly one roster", () => {
    for (const id of HERO_IDS) {
      expect(HEROES[id], id).toBeDefined();
      expect(BACKGROUND_IDS.filter((bg) => HEROES_BY_BACKGROUND[bg].includes(id)), id).toHaveLength(1);
    }
    const all = BACKGROUND_IDS.flatMap((bg) => [...heroesFor(bg)]);
    expect([...all].sort()).toEqual([...HERO_IDS].sort());
  });

  test("the rosters mirror each other in rarity and specialty", () => {
    const shape = (bg: BackgroundId): string[] => heroesFor(bg).map((id) => `${HEROES[id].rarity}/${HEROES[id].specialty}`).sort();
    expect(shape("vietnam")).toEqual(shape("algeria"));
  });

  test("a draw only ever yields a hero of the player's background", () => {
    for (const bg of BACKGROUND_IDS) {
      let roster = createBaseState(T0).heroes;
      for (let i = 0; i < 60; i++) {
        const draw = drawHero(roster, () => ((i * 7919 + 13) % 997) / 997, bg);
        expect(heroesFor(bg)).toContain(draw.heroId);
        roster = draw.roster;
      }
    }
  });

  test("an old saved base without a story migrates to a valid base", () => {
    const old = JSON.parse(JSON.stringify(createBaseState(T0)));
    delete old.story;
    expect(isBaseState(old)).toBe(false);
    const v = migrateBaseState(old) as BaseState;
    expect(isBaseState(v)).toBe(true);
    expect(v.story).toEqual({ chapter: 0, victories: 0 });
  });
});

describe("story per background", () => {
  test("every background has chapters, all draft, with unique ids", () => {
    for (const bg of BACKGROUND_IDS) {
      const chapters = chaptersFor(bg);
      expect(chapters.length).toBeGreaterThanOrEqual(3);
      expect(new Set(chapters.map((c) => c.id)).size).toBe(chapters.length);
      for (const c of chapters) expect(c.reviewed, `${bg}.${c.id}`).toBe(false);
    }
  });

  test("objectives name only that roster's heroes", () => {
    for (const bg of BACKGROUND_IDS) {
      for (const c of STORY[bg]) {
        expect(c.reward.shards).toBeGreaterThanOrEqual(0);
        for (const o of c.objectives) {
          if ((o.kind === "hero_recruited" || o.kind === "hero_level") && o.hero !== null) expect(heroesFor(bg).includes(o.hero)).toBe(true);
          if (o.kind === "building_level") expect(BUILDING_IDS.includes(o.building)).toBe(true);
        }
      }
    }
  });

  test("Vietnam chapter 1 finishes from the start resources and its reward covers a recruit draw", () => {
    const up = startUpgrade(createBaseState(T0), "hq", T0);
    if (!up.ok) throw new Error(up.reason);
    const done = advance(up.state, T0 + 60 * SEC);
    expect(chapterStatus(done, "vietnam")).toBe("ready");
    const claim = claimChapter(done, T0 + 60 * SEC, "vietnam");
    if (!claim.ok) throw new Error(claim.reason);
    expect(claim.state.story.chapter).toBe(1);
    expect(claim.state.resources.funds).toBeGreaterThanOrEqual(HERO_DRAW_COST.funds);
    expect(currentChapter(claim.state, "vietnam")?.id).toBe("ch2");
  });

  test("the whole Vietnam campaign claims in order using Vietnam heroes only", () => {
    let s: BaseState = base();
    for (let i = 0; i < chaptersFor("vietnam").length; i++) {
      s = { ...s, story: { chapter: i, victories: 5 } };
      for (const o of chaptersFor("vietnam")[i]!.objectives) {
        if (o.kind === "building_level") s = { ...s, levels: { ...s.levels, [o.building]: o.level } };
        if (o.kind === "troops_owned") s = { ...s, troops: { ...s.troops, infantry: o.count } };
        if (o.kind === "hero_recruited" || o.kind === "hero_level") s = withHeroes(s, { trail_scout: { level: 5, shards: s.heroes.owned.trail_scout?.shards ?? 0 } });
      }
      const r = claimChapter(s, T0, "vietnam");
      if (!r.ok) throw new Error(`chapter ${i + 1}: ${r.reason}`);
      s = r.state;
    }
    for (const id of HEROES_BY_BACKGROUND.algeria) expect(s.heroes.owned[id], id).toBeUndefined();
    expect(claimChapter(s, T0, "vietnam")).toMatchObject({ ok: false, reason: "story_complete" });
  });

  test("a Vietnam claim is refused until its objectives are met; time going back or far ahead behaves", () => {
    const s = createBaseState(T0);
    expect(claimChapter(s, T0, "vietnam")).toMatchObject({ ok: false, reason: "objectives_unmet" });
    const back = claimChapter({ ...s, levels: { ...s.levels, hq: 2 } }, T0 - DAY, "vietnam");
    if (!back.ok) throw new Error(back.reason);
    expect(back.state.lastUpdated).toBe(s.lastUpdated);
    const far = claimChapter({ ...s, levels: { ...s.levels, hq: 2 } }, T0 + 1000 * DAY, "vietnam");
    expect(far.ok).toBe(true);
  });
});
