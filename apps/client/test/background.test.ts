import {
  claimChapter,
  createBaseState,
  heroesFor,
  recruitHero,
  startUpgrade,
  type BackgroundId,
  type BaseState,
} from "@revolt/rules";
import i18next from "i18next";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { t } from "../src/i18n/i18n.ts";
import { bgKey, bgKeys } from "../src/i18n/bg-keys.ts";

/** Translates for an explicit background rather than the active one. */
const tBg = (background: BackgroundId, key: string): string => i18next.t(bgKeys(background, key));
import { ar } from "../src/i18n/locales/ar.ts";
import { en } from "../src/i18n/locales/en.ts";
import { fr } from "../src/i18n/locales/fr.ts";
import { artKeyFor, BACKGROUND_ART } from "../src/art/art.ts";
import { ApiError, type AccountView, type Api, type HeroReply, type SessionSnapshot, type StoryReply } from "../src/net/api.ts";
import { SESSION_KEY } from "../src/net/session.ts";
import { activeBackground, getBackground, setActiveBackground } from "../src/state/background.ts";
import { connectGameStore } from "../src/state/game-store.ts";
import { availableHeroes, heroCard, heroCards, storyClaimable, storyView } from "../src/state/hero-view.ts";
import { SAVE_KEY, serializeSave } from "../src/state/save.ts";
import { UNUSED_ALLIANCE_API } from "./fixtures.ts";

const T0 = Date.UTC(2026, 9, 1);

const memoryStorage = (init: Record<string, string> = {}): Storage => {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
};

beforeAll(async () => {
  await i18next.init({ lng: "en", fallbackLng: false, resources: { en: { translation: en }, fr: { translation: fr }, ar: { translation: ar } }, interpolation: { escapeValue: false }, returnNull: false });
});
afterEach(() => setActiveBackground("algeria"));

describe("background text lookup", () => {
  test("keys try the background's own first, then the shared one; the picker's keys are never overridden", () => {
    expect(bgKey("vietnam", "building.farm.name")).toBe("background.vietnam.building.farm.name");
    expect(bgKeys("vietnam", "building.farm.name")).toEqual(["background.vietnam.building.farm.name", "building.farm.name"]);
    expect(bgKeys("vietnam", "background.pick.title")).toEqual(["background.pick.title"]);
  });

  test("a background override wins, and anything without one falls back to the shared text", async () => {
    expect(tBg("vietnam", "building.farm.name")).toBe("Rice paddies");
    expect(tBg("algeria", "building.farm.name")).toBe("Farm");
    expect(tBg("vietnam", "resource.food")).toBe("Rice");
    expect(tBg("algeria", "resource.food")).toBe("Provisions");
    // No Vietnam override for NPCs or for hero names (their ids are already per background).
    expect(tBg("vietnam", "npc.patrol.name")).toBe(tBg("algeria", "npc.patrol.name"));
    expect(tBg("vietnam", "hero.trail_scout.name")).toBe("Trail scout");
    // An unknown key stays visible as the key, as before.
    expect(tBg("vietnam", "nope.nothing")).toBe("nope.nothing");
  });

  test("t follows the active background, in every language", async () => {
    setActiveBackground("vietnam");
    expect(t("troop.porters.name")).toBe("Porter columns");
    await i18next.changeLanguage("ar");
    expect(t("building.farm.name")).toBe(ar.background.vietnam.building.farm.name);
    await i18next.changeLanguage("fr");
    expect(t("resource.food")).toBe("Riz");
    await i18next.changeLanguage("en");
    setActiveBackground("algeria");
    expect(t("troop.porters.name")).toBe("Porters");
  });

  test("art falls back to the shared sprite until a background has its own", () => {
    for (const bg of ["algeria", "vietnam"] as const) expect(artKeyFor(bg, "buildings/farm")).toBe(BACKGROUND_ART[bg].has("buildings/farm") ? `${bg}/buildings/farm` : "buildings/farm");
    expect(artKeyFor("vietnam", "buildings/hq")).toBe("buildings/hq");
  });

  test("an account from an older server has no background and plays Algeria", () => {
    expect(getBackground({})).toBe("algeria");
    expect(getBackground({ background: "vietnam" })).toBe("vietnam");
    expect(activeBackground()).toBe("algeria");
  });
});

describe("hero view by background", () => {
  test("the cards and the march roster are the background's own heroes", () => {
    const s = createBaseState(T0);
    expect(heroCards(s, "vietnam").map((c) => c.id).sort()).toEqual([...heroesFor("vietnam")].sort());
    expect(heroCards(s, "algeria").map((c) => c.id).sort()).toEqual([...heroesFor("algeria")].sort());
    expect(heroCards(s)).toHaveLength(6);
    const owned: BaseState = { ...s, heroes: { ...s.heroes, courier: { level: 1, shards: 0 }, trail_scout: { level: 1, shards: 0 } } };
    expect(availableHeroes(owned, "vietnam")).toEqual(["trail_scout"]);
    expect(availableHeroes(owned, "algeria")).toEqual(["courier"]);
  });

  test("an Algeria hero card on a Vietnam account cannot be recruited", () => {
    const s = { ...createBaseState(T0), resources: { food: 0, materiel: 0, funds: 0, support: 500 }, heroes: { ...createBaseState(T0).heroes, courier: { level: 0, shards: 50 } } };
    expect(heroCard(s, "courier", "algeria").recruit).toBeNull();
    expect(heroCard(s, "courier", "vietnam").recruit).toBe("unknown_hero");
  });

  test("the story view follows the background's chapters", () => {
    const s = createBaseState(T0);
    expect(storyView(s, "vietnam").chapter?.id).toBe("ch1");
    expect(storyClaimable(s, "vietnam")).toBe(false);
  });
});

const account = (background?: BackgroundId): AccountView => ({ id: "acc-1", handle: "ABC234", google: null, ...(background === undefined ? {} : { background }) });

/** A stand-in server for one account, answering story and hero intents with the shared rules for its background. */
const fakeServer = (background: BackgroundId, initial: BaseState = createBaseState(T0)) => {
  let state = initial;
  const calls: string[] = [];
  const created: (BackgroundId | undefined)[] = [];
  const valid = new Set(["tok-1"]);
  const unused = async (): Promise<never> => {
    throw new Error("unused");
  };
  const api: Api = {
    ...UNUSED_ALLIANCE_API,
    upgrade: unused,
    train: unused,
    march: unused,
    getMap: unused,
    getReports: async () => ({ reports: [], now: T0 }),
    signInWithGoogle: unused,
    heroLevel: unused,
    createGuest: async (_save, bg): Promise<SessionSnapshot> => {
      calls.push("guest");
      created.push(bg);
      valid.add("tok-new");
      return { token: "tok-new", account: account(bg ?? "algeria"), state, now: T0 };
    },
    getState: async (token) => {
      calls.push("state");
      if (!valid.has(token)) throw new ApiError(401, "unauthorized");
      return { account: account(background), state, now: T0 };
    },
    heroRecruit: async (_t, hero): Promise<HeroReply> => {
      const r = recruitHero(state, hero, T0, background);
      state = r.state;
      return r.ok ? { ok: true, state, now: T0 } : { ok: false, reason: r.reason, state, now: T0 };
    },
    storyClaim: async (): Promise<StoryReply> => {
      calls.push("claim");
      const r = claimChapter(state, T0, background);
      state = r.state;
      return r.ok ? { ok: true, state, now: T0 } : { ok: false, reason: r.reason, state, now: T0 };
    },
  };
  return { api, calls, created, state: () => state };
};

const ready = (): BaseState => {
  const up = startUpgrade(createBaseState(T0), "hq", T0);
  if (!up.ok) throw new Error(up.reason);
  return { ...up.state, levels: { ...up.state.levels, hq: 2 }, queue: null };
};

describe("the game store and the chosen background", () => {
  test("a new device asks once, creates the guest with the answer and plays that background", async () => {
    const f = fakeServer("vietnam");
    let asked = 0;
    const store = await connectGameStore({
      api: f.api,
      storage: memoryStorage(),
      clock: () => T0,
      chooseBackground: async () => {
        asked++;
        return "vietnam";
      },
    });
    expect(asked).toBe(1);
    expect(f.created).toEqual(["vietnam"]);
    expect(store.background()).toBe("vietnam");
    expect(activeBackground()).toBe("vietnam");
  });

  test("a device with a session is never asked", async () => {
    const f = fakeServer("vietnam");
    const store = await connectGameStore({
      api: f.api,
      storage: memoryStorage({ [SESSION_KEY]: "tok-1" }),
      clock: () => T0,
      chooseBackground: async () => {
        throw new Error("must not be asked");
      },
    });
    expect(f.created).toEqual([]);
    expect(store.background()).toBe("vietnam");
  });

  test("a stale token asks, and a device with an old local save is Algeria without asking", async () => {
    const stale = fakeServer("algeria");
    let asked = 0;
    await connectGameStore({ api: stale.api, storage: memoryStorage({ [SESSION_KEY]: "tok-stale" }), clock: () => T0, chooseBackground: async () => (asked++, "vietnam") });
    expect(asked).toBe(1);

    const legacy = fakeServer("algeria");
    const save = memoryStorage({ [SAVE_KEY]: serializeSave({ ...createBaseState(T0), levels: { hq: 2, farm: 1, armory: 1, treasury: 1, barracks: 1, hero_hall: 1 } }) });
    await connectGameStore({ api: legacy.api, storage: save, clock: () => T0, chooseBackground: async () => (asked++, "vietnam") });
    expect(asked).toBe(1);
    expect(legacy.created).toEqual(["algeria"]);
  });

  test("without a chooser the default is Algeria, as in older tests and builds", async () => {
    const f = fakeServer("algeria");
    await connectGameStore({ api: f.api, storage: memoryStorage(), clock: () => T0 });
    expect(f.created).toEqual(["algeria"]);
  });

  test("a Vietnam claim is predicted like the rules (and the server) decide it", async () => {
    const f = fakeServer("vietnam", ready());
    const store = await connectGameStore({ api: f.api, storage: memoryStorage({ [SESSION_KEY]: "tok-1" }), clock: () => T0 });
    const predicted = claimChapter(store.state(), T0, "vietnam");
    if (!predicted.ok) throw new Error(predicted.reason);
    expect(await store.claimChapter()).toEqual({ ok: true });
    expect(store.state().story.chapter).toBe(1);
    expect(store.state().heroes.trail_scout.shards).toBe(10);
    expect(store.state().heroes.courier.shards).toBe(0);
    expect(store.state()).toEqual(f.state());
    expect(store.state().heroes).toEqual(predicted.state.heroes);
  });

  test("an Algeria hero is refused locally for a Vietnam account and never sent", async () => {
    const s = createBaseState(T0);
    const f = fakeServer("vietnam", { ...s, resources: { ...s.resources, support: 500 }, heroes: { ...s.heroes, courier: { level: 0, shards: 50 }, trail_scout: { level: 0, shards: 50 } } });
    const store = await connectGameStore({ api: f.api, storage: memoryStorage({ [SESSION_KEY]: "tok-1" }), clock: () => T0 });
    expect(await store.recruitHero("courier")).toEqual({ ok: false, reason: "unknown_hero" });
    expect(await store.recruitHero("trail_scout")).toEqual({ ok: true });
  });
});
