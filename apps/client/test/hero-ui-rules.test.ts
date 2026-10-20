import { claimChapter, createBaseState, startMarch, type BaseState, type MarchState } from "@revolt/rules";
import { beforeAll, describe, expect, test } from "vitest";
import { initI18n } from "../src/i18n/i18n.ts";
import { availableHeroes, bonusSummary, heroCard, heroCards, storyClaimable, storyView } from "../src/state/hero-view.ts";
import { sentHeroes } from "../src/net/api.ts";
import { previewMarch } from "../src/state/tile-info.ts";
import { objectiveText } from "../src/ui/story-panel.ts";

const T0 = Date.UTC(2026, 9, 1);

const withHeroes = (s: BaseState, heroes: Partial<BaseState["heroes"]>): BaseState => ({ ...s, heroes: { ...s.heroes, ...heroes } });
const rich = (): BaseState => ({ ...createBaseState(T0), resources: { food: 900, materiel: 900, funds: 900, support: 200 } });

describe("hero cards: which buttons are on", () => {
  test("a hero with enough shards and support can be recruited; otherwise the reason says why", () => {
    const s = withHeroes(rich(), { courier: { level: 0, shards: 10 }, organizer: { level: 0, shards: 5 } });
    expect(heroCard(s, "courier").recruit).toBeNull();
    expect(heroCard(s, "organizer").recruit).toBe("not_enough_shards");
    expect(heroCard({ ...s, resources: { ...s.resources, support: 0 } }, "courier").recruit).toBe("insufficient");
    expect(heroCard(s, "courier").levelUp).toBe("not_recruited");
  });

  test("a recruited hero levels up until the hero hall's cap", () => {
    const s = withHeroes(rich(), { courier: { level: 1, shards: 99 } });
    expect(heroCard(s, "courier").levelUp).toBeNull();
    expect(heroCard(s, "courier").nextCost?.shards).toBe(5);
    const atCap = withHeroes(s, { courier: { level: 2, shards: 99 } });
    expect(heroCard(atCap, "courier").levelUp).toBe("hall_level");
    expect(heroCard(atCap, "courier").cap).toBe(2);
    expect(heroCard(s, "courier").recruit).toBe("already_recruited");
  });

  test("recruited heroes are listed first", () => {
    const s = withHeroes(rich(), { quartermaster: { level: 3, shards: 0 } });
    expect(heroCards(s)[0]?.id).toBe("quartermaster");
    expect(heroCards(s)).toHaveLength(6);
  });

  test("a hero away on a march is busy and cannot be picked again", () => {
    const base = withHeroes({ ...rich(), troops: { infantry: 20, scouts: 0, heavy: 0, porters: 0 } }, { courier: { level: 2, shards: 0 }, medic: { level: 1, shards: 0 } });
    expect(availableHeroes(base)).toEqual(["courier", "medic"]);
    const march: Omit<MarchState, "outcome"> = {
      id: "m1",
      target: { npcId: "n", level: 1, x: 1, y: 1 },
      from: { x: 0, y: 0 },
      troops: { infantry: 5, scouts: 0, heavy: 0, porters: 0 },
      departAt: T0,
      arriveAt: T0 + 1000,
      returnAt: T0 + 2000,
      heroes: [{ id: "courier", level: 2 }],
    };
    const out = startMarch(base, march, T0);
    if (!out.ok) throw new Error(out.reason);
    expect(availableHeroes(out.state)).toEqual(["medic"]);
    expect(heroCard(out.state, "courier").busy).toBe(true);
  });
});

describe("march preview with heroes", () => {
  const s = withHeroes(rich(), { courier: { level: 2, shards: 0 } });
  const troops = { infantry: 5, scouts: 0, heavy: 0, porters: 0 };

  test("the dialog uses the shared squad rules", () => {
    expect(previewMarch(s, { x: 0, y: 0 }, { x: 3, y: 4 }, troops, ["courier"]).reason).toBeNull();
    expect(previewMarch(s, { x: 0, y: 0 }, { x: 3, y: 4 }, troops, ["medic"]).reason).toBe("hero_not_owned");
    expect(previewMarch(s, { x: 0, y: 0 }, { x: 3, y: 4 }, troops, ["courier", "courier"]).reason).toBe("bad_squad");
    expect(previewMarch(s, { x: 0, y: 0 }, { x: 3, y: 4 }, troops).reason).toBeNull();
  });

  test("bonus summary is zero without heroes and grows with the lead's level", () => {
    expect(bonusSummary(s, [])).toEqual({ attack: 0, hp: 0, carry: 0 });
    const low = bonusSummary(s, ["courier"]);
    const high = bonusSummary(withHeroes(s, { courier: { level: 10, shards: 0 } }), ["courier"]);
    expect(low.attack).toBeGreaterThan(0);
    expect(high.attack).toBeGreaterThan(low.attack);
  });

  test("the request names hero ids only, and leaves the key out when nobody goes", () => {
    expect(sentHeroes([])).toEqual({});
    expect(sentHeroes(["courier", "medic"])).toEqual({ heroes: ["courier", "medic"] });
  });
});

describe("story view", () => {
  test("a new base is on chapter 1 with nothing to claim", () => {
    const v = storyView(createBaseState(T0));
    expect(v.chapter?.id).toBe("ch1");
    expect(v.status).toBe("in_progress");
    expect(storyClaimable(createBaseState(T0))).toBe(false);
  });

  test("the claim badge shows when the objectives are met, and clears after claiming", () => {
    const ready: BaseState = { ...createBaseState(T0), levels: { ...createBaseState(T0).levels, hq: 2 } };
    expect(storyClaimable(ready)).toBe(true);
    const claimed = claimChapter(ready, T0);
    if (!claimed.ok) throw new Error(claimed.reason);
    expect(storyClaimable(claimed.state)).toBe(false);
    expect(storyView(claimed.state).claimed).toBe(1);
    expect(storyView(claimed.state).chapter?.id).toBe("ch2");
  });

  test("a finished campaign has no chapter and is complete", () => {
    const done: BaseState = { ...createBaseState(T0), story: { chapter: 99, victories: 0 } };
    expect(storyView(done)).toMatchObject({ chapter: null, status: "complete" });
    expect(storyClaimable(done)).toBe(false);
  });
});

describe("objective sentences", () => {
  beforeAll(async () => {
    // i18n sets lang, dir and the title on `document`; a bare stand-in is enough here.
    Object.defineProperty(globalThis, "document", { value: { documentElement: {}, title: "" }, configurable: true });
    await initI18n("en");
  });

  test("each kind reads as a sentence with no raw key left in it", () => {
    const lines = [
      objectiveText({ kind: "building_level", building: "hq", level: 2 }),
      objectiveText({ kind: "troops_owned", count: 20 }),
      objectiveText({ kind: "hero_recruited", hero: null }),
      objectiveText({ kind: "hero_recruited", hero: "medic" }),
      objectiveText({ kind: "hero_level", hero: null, level: 2 }),
      objectiveText({ kind: "hero_level", hero: "courier", level: 3 }),
      objectiveText({ kind: "victories", count: 1 }),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/story\.objective|\{\{/);
      expect(line.length).toBeGreaterThan(4);
    }
    expect(lines[0]).toContain("Command post");
    expect(lines[3]).toContain("Field medic");
  });
});
