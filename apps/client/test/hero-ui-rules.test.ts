import { claimChapter, createBaseState, startMarch, type BaseState, type MarchState } from "@revolt/rules";
import { beforeAll, describe, expect, test } from "vitest";
import { initI18n } from "../src/i18n/i18n.ts";
import { availableHeroes, bonusSummary, heroCard, heroCards, recruitBlock, storyClaimable, storyView } from "../src/state/hero-view.ts";
import { sentHeroes } from "../src/net/api.ts";
import { previewMarch } from "../src/state/tile-info.ts";
import { objectiveText } from "../src/ui/story-panel.ts";

const T0 = Date.UTC(2026, 9, 1);

const withHeroes = (s: BaseState, owned: BaseState["heroes"]["owned"]): BaseState => ({ ...s, heroes: { ...s.heroes, owned } });
const rich = (): BaseState => ({ ...createBaseState(T0), resources: { food: 900, materiel: 900, funds: 900, support: 200 }, levels: { ...createBaseState(T0).levels, hero_hall: 2 } });

describe("hero cards: which buttons are on", () => {
  test("the recruit draw needs the hall level and the funds; the reason says which", () => {
    expect(recruitBlock(rich())).toBeNull();
    expect(recruitBlock({ ...rich(), levels: { ...rich().levels, hero_hall: 1 } })).toBe("hero_hall_level");
    expect(recruitBlock({ ...rich(), resources: { ...rich().resources, funds: 0 } })).toBe("insufficient");
  });

  test("an owned hero levels up until the hall's cap or its shards run out", () => {
    const s = withHeroes(rich(), { mountain_guide: { level: 1, shards: 99 } });
    expect(heroCard(s, "mountain_guide").levelUp).toBeNull();
    expect(heroCard(s, "mountain_guide").nextShards).toBe(2);
    const atCap = withHeroes(s, { mountain_guide: { level: 4, shards: 99 } });
    expect(heroCard(atCap, "mountain_guide").levelUp).toBe("hall_cap");
    expect(heroCard(atCap, "mountain_guide").cap).toBe(4);
    expect(heroCard(withHeroes(s, { mountain_guide: { level: 1, shards: 0 } }), "mountain_guide").levelUp).toBe("not_enough_shards");
    expect(heroCard(rich(), "mountain_guide").owned).toBeNull();
  });

  test("owned heroes are listed first, and only the background's own heroes appear", () => {
    const s = withHeroes(rich(), { iron_quartermaster: { level: 3, shards: 0 } });
    expect(heroCards(s)[0]?.id).toBe("iron_quartermaster");
    expect(heroCards(s)).toHaveLength(4);
    expect(heroCards(s, "vietnam").map((c) => c.id).sort()).toEqual(["column_commander", "field_medic", "porter_chief", "trail_scout"]);
  });

  test("a hero away on a march is busy and cannot be picked again", () => {
    const base = withHeroes({ ...rich(), troops: { infantry: 20, scouts: 0, heavy: 0, porters: 0 } }, { mountain_guide: { level: 2, shards: 0 }, dock_foreman: { level: 1, shards: 0 } });
    expect(availableHeroes(base)).toEqual(["mountain_guide", "dock_foreman"]);
    const march: Omit<MarchState, "outcome"> = {
      id: "m1",
      target: { npcId: "n", level: 1, x: 1, y: 1 },
      from: { x: 0, y: 0 },
      troops: { infantry: 5, scouts: 0, heavy: 0, porters: 0 },
      departAt: T0,
      arriveAt: T0 + 1000,
      returnAt: T0 + 2000,
      heroes: { lead: "mountain_guide", deputies: [], levels: { mountain_guide: 2 } },
    };
    const out = startMarch(base, march, T0);
    if (!out.ok) throw new Error(out.reason);
    expect(availableHeroes(out.state)).toEqual(["dock_foreman"]);
    expect(heroCard(out.state, "mountain_guide").busy).toBe(true);
  });
});

describe("march preview with heroes", () => {
  const s = withHeroes(rich(), { mountain_guide: { level: 2, shards: 0 }, dock_foreman: { level: 1, shards: 0 } });
  const troops = { infantry: 5, scouts: 0, heavy: 0, porters: 0 };
  const from = { x: 0, y: 0 };
  const to = { x: 3, y: 4 };

  test("the dialog uses the shared loadout rules", () => {
    expect(previewMarch(s, from, to, troops, { lead: "mountain_guide", deputies: [] }).reason).toBeNull();
    expect(previewMarch(s, from, to, troops, { lead: "hill_commander", deputies: [] }).reason).toBe("not_owned");
    expect(previewMarch(s, from, to, troops, { lead: "mountain_guide", deputies: ["mountain_guide"] }).reason).toBe("duplicate_hero");
    expect(previewMarch(s, from, to, troops).reason).toBeNull();
  });

  test("bonus summary is zero without heroes and grows with the lead's level", () => {
    expect(bonusSummary(s, null)).toEqual({ attack: 0, defense: 0 });
    const low = bonusSummary(s, { lead: "mountain_guide", deputies: [] });
    const high = bonusSummary(withHeroes(s, { mountain_guide: { level: 10, shards: 0 } }), { lead: "mountain_guide", deputies: [] });
    expect(low.attack).toBeGreaterThan(0);
    expect(high.attack).toBeGreaterThan(low.attack);
  });

  test("the request names the lead and deputies only, and leaves the key out when nobody goes", () => {
    expect(sentHeroes(null)).toEqual({});
    expect(sentHeroes({ lead: "mountain_guide", deputies: ["dock_foreman"] })).toEqual({ heroes: { lead: "mountain_guide", deputies: ["dock_foreman"] } });
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
      objectiveText({ kind: "hero_recruited", hero: "dock_foreman" }),
      objectiveText({ kind: "hero_level", hero: null, level: 2 }),
      objectiveText({ kind: "hero_level", hero: "mountain_guide", level: 3 }),
      objectiveText({ kind: "victories", count: 1 }),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/story\.objective|\{\{/);
      expect(line.length).toBeGreaterThan(4);
    }
    expect(lines[0]).toContain("Command post");
    expect(lines[3]).toContain("Dock foreman");
  });
});
