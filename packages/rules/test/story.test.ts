import { describe, expect, test } from "vitest";
import {
  advance,
  createBaseState,
  BUILDING_IDS,
  chapterStatus,
  chaptersFor,
  claimChapter,
  currentChapter,
  HERO_DRAW_COST,
  MAX_HERO_LEVEL,
  objectiveProgress,
  startUpgrade,
  storageCap,
  STORY,
  type BaseState,
  type Objective,
} from "../src/index.ts";
import { base, DAY, SEC, T0, withHeroes } from "./helpers.ts";

const chapters = chaptersFor();

describe("objectives", () => {
  const s = withHeroes(
    { ...base(), troops: { infantry: 10, scouts: 5, heavy: 0, porters: 0 }, story: { chapter: 0, victories: 2 } },
    { dock_foreman: { level: 3, shards: 0 } },
  );

  test("each kind is computed from state", () => {
    const check = (o: Objective) => objectiveProgress(s, o);
    expect(check({ kind: "building_level", building: "farm", level: 2 })).toEqual({ done: false, have: 1, need: 2 });
    expect(check({ kind: "building_level", building: "hq", level: 2 }).done).toBe(true);
    expect(check({ kind: "troops_owned", count: 15 }).done).toBe(true);
    expect(check({ kind: "troops_owned", count: 16 }).done).toBe(false);
    expect(check({ kind: "hero_recruited", hero: null }).done).toBe(true);
    expect(check({ kind: "hero_recruited", hero: "mountain_guide" }).done).toBe(false);
    expect(check({ kind: "hero_level", hero: null, level: 3 }).done).toBe(true);
    expect(check({ kind: "hero_level", hero: "dock_foreman", level: 4 })).toEqual({ done: false, have: 3, need: 4 });
    expect(check({ kind: "hero_level", hero: "mountain_guide", level: 1 }).done).toBe(false);
    expect(check({ kind: "victories", count: 2 }).done).toBe(true);
  });

  test("troops away on a march still count as owned", () => {
    const away: BaseState = {
      ...s,
      troops: { infantry: 0, scouts: 0, heavy: 0, porters: 0 },
      marches: [{ id: "m", target: { npcId: "n", level: 1, x: 1, y: 1 }, from: { x: 0, y: 0 }, troops: { infantry: 30, scouts: 0, heavy: 0, porters: 0 }, departAt: 0, arriveAt: 1, returnAt: 2, outcome: null }],
    };
    expect(objectiveProgress(away, { kind: "troops_owned", count: 30 }).done).toBe(true);
  });

  test("progress is capped at the target so bars never overflow", () => {
    expect(objectiveProgress(s, { kind: "victories", count: 1 })).toEqual({ done: true, have: 1, need: 1 });
  });
});

describe("claiming chapters", () => {
  test("a new base is on chapter 1, in progress", () => {
    expect(currentChapter(createBaseState(T0))?.id).toBe("ch1");
    expect(chapterStatus(createBaseState(T0))).toBe("in_progress");
  });

  test("an unmet chapter is refused and nothing changes", () => {
    const r = claimChapter(createBaseState(T0), T0);
    expect(r).toMatchObject({ ok: false, reason: "objectives_unmet" });
    expect(r.state.story.chapter).toBe(0);
  });

  test("chapter 1 is finished with the start resources and 60 seconds", () => {
    const up = startUpgrade(createBaseState(T0), "hq", T0);
    if (!up.ok) throw new Error(up.reason);
    expect(chapterStatus(advance(up.state, T0 + 59 * SEC))).toBe("in_progress");
    const done = advance(up.state, T0 + 60 * SEC);
    expect(chapterStatus(done)).toBe("ready");
    const claim = claimChapter(done, T0 + 60 * SEC);
    if (!claim.ok) throw new Error(claim.reason);
    expect(claim.state.story.chapter).toBe(1);
  });

  test("the chapter 1 reward covers a recruit draw in funds, so no other source is needed", () => {
    const up = startUpgrade(createBaseState(T0), "hq", T0);
    if (!up.ok) throw new Error(up.reason);
    const claim = claimChapter(up.state, T0 + 60 * SEC);
    if (!claim.ok) throw new Error(claim.reason);
    expect(claim.state.resources.funds).toBeGreaterThanOrEqual(HERO_DRAW_COST.funds);
  });

  test("chapter shards go to the first owned hero of the background, and nowhere if none is owned", () => {
    const owned = claimChapter(withHeroes(withReady(1), { dock_foreman: { level: 1, shards: 0 }, mountain_guide: { level: 1, shards: 1 } }), T0);
    if (!owned.ok) throw new Error(owned.reason);
    expect(owned.state.heroes.owned.mountain_guide?.shards).toBe(1 + chapters[1]!.reward.shards);
    expect(owned.state.heroes.owned.dock_foreman?.shards).toBe(0);
    const none = claimChapter(withReady(0), T0);
    if (!none.ok) throw new Error(none.reason);
    expect(Object.keys(none.state.heroes.owned)).toHaveLength(0);
  });

  test("claiming the same chapter twice is refused: it advances once", () => {
    const first = claimChapter(withReady(0), T0);
    if (!first.ok) throw new Error(first.reason);
    expect(first.state.story.chapter).toBe(1);
    expect(claimChapter(first.state, T0).ok).toBe(false);
    expect(Object.keys(first.state.heroes.owned)).toHaveLength(0);
  });

  test("the whole campaign claims in order, then reports story_complete", () => {
    let s = withReady(0);
    for (let i = 0; i < chapters.length; i++) {
      s = withReady(i, s);
      const r = claimChapter(s, T0);
      if (!r.ok) throw new Error(`chapter ${i + 1}: ${r.reason}`);
      expect(r.state.story.chapter).toBe(i + 1);
      s = r.state;
    }
    expect(currentChapter(s)).toBeNull();
    expect(chapterStatus(s)).toBe("complete");
    expect(claimChapter(s, T0)).toMatchObject({ ok: false, reason: "story_complete" });
  });

  test("rewards fill storage only up to the cap and never lower an amount already above it", () => {
    const cap = storageCap(2);
    const nearFull = { ...withReady(0), resources: { food: cap.food - 10, materiel: cap.materiel + 500, funds: 0, support: 0 } };
    const r = claimChapter(nearFull, nearFull.lastUpdated);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.resources.food).toBe(cap.food);
    expect(r.state.resources.materiel).toBe(cap.materiel + 500);
    expect(r.state.resources.funds).toBeGreaterThan(0);
  });

  test("a claim with the clock going backwards or after a very long gap behaves", () => {
    const s = withReady(0);
    const back = claimChapter(s, T0 - DAY);
    if (!back.ok) throw new Error(back.reason);
    expect(back.state.lastUpdated).toBe(s.lastUpdated);
    const far = claimChapter(s, T0 + 1000 * DAY);
    if (!far.ok) throw new Error(far.reason);
    expect(far.state.resources.food).toBeLessThanOrEqual(storageCap(2).food);
  });

  test("the claim does not mutate its input", () => {
    const s = withReady(0);
    const copy = JSON.stringify(s);
    claimChapter(s, T0);
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe("story data", () => {
  test("chapter ids are unique and every chapter is draft until a historian signs it off", () => {
    const ids = chapters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const bg of Object.values(STORY)) for (const c of bg) expect(c.reviewed, `${c.id} reviewed`).toBe(false);
  });

  test("every chapter has scenes and objectives, and a non-negative shard reward", () => {
    for (const c of chapters) {
      expect(c.scenes).toBeGreaterThan(0);
      expect(c.objectives.length).toBeGreaterThan(0);
      expect(c.reward.shards).toBeGreaterThanOrEqual(0);
      for (const o of c.objectives) {
        if (o.kind === "building_level") expect(BUILDING_IDS.includes(o.building)).toBe(true);
        if (o.kind === "hero_level") expect(o.level).toBeLessThanOrEqual(MAX_HERO_LEVEL);
      }
    }
  });
});

/** A base that meets chapter `index`'s objectives (and every earlier one), keeping `from`'s other fields. */
function withReady(index: number, from: BaseState = base()): BaseState {
  let s: BaseState = { ...from, story: { ...from.story, chapter: index } };
  for (const o of chapters[index]!.objectives) {
    if (o.kind === "building_level") s = { ...s, levels: { ...s.levels, [o.building]: o.level } };
    if (o.kind === "troops_owned") s = { ...s, troops: { ...s.troops, infantry: Math.max(s.troops.infantry, o.count) } };
    if (o.kind === "hero_recruited") s = withHeroes(s, { mountain_guide: { level: Math.max(1, s.heroes.owned.mountain_guide?.level ?? 0), shards: s.heroes.owned.mountain_guide?.shards ?? 0 } });
    if (o.kind === "hero_level") s = withHeroes(s, { mountain_guide: { level: Math.max(o.level, s.heroes.owned.mountain_guide?.level ?? 0), shards: s.heroes.owned.mountain_guide?.shards ?? 0 } });
    if (o.kind === "victories") s = { ...s, story: { ...s.story, victories: Math.max(o.count, s.story.victories) } };
  }
  return s;
}
