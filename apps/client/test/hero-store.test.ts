import { claimChapter, createBaseState, levelUpHero, recruitHero, seededRng, type BaseState, type HeroLoadout } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { ApiError, type AccountView, type Api, type HeroReply, type MarchReply, type StoryReply } from "../src/net/api.ts";
import { SESSION_KEY } from "../src/net/session.ts";
import { connectGameStore } from "../src/state/game-store.ts";
import { UNUSED_ALLIANCE_API } from "./fixtures.ts";

const T0 = Date.UTC(2026, 9, 1);
const GUEST: AccountView = { id: "acc-1", handle: "ABC234", google: null };

const memoryStorage = (): Storage => {
  const m = new Map<string, string>([[SESSION_KEY, "tok-1"]]);
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

/** A base whose hall is built up and that can pay for a draw. */
const stocked = (): BaseState => {
  const s = createBaseState(T0);
  return { ...s, levels: { ...s.levels, hero_hall: 3 }, resources: { food: 900, materiel: 900, funds: 900, support: 100 } };
};

/** An owned hero with shards, ready to level. */
const withOwned = (s: BaseState): BaseState => ({ ...s, heroes: { ...s.heroes, owned: { mountain_guide: { level: 1, shards: 20 } } } });

/** A stand-in server that applies the shared rules, optionally lying or failing, so the tests can see which state wins. */
const fakeApi = (initial: BaseState, opts: { fail?: boolean; serverState?: () => BaseState } = {}) => {
  let state = initial;
  const calls: string[] = [];
  const marchHeroes: (HeroLoadout | null | undefined)[] = [];
  const api: Api = {
    ...UNUSED_ALLIANCE_API,
    createGuest: async () => {
      throw new Error("unused");
    },
    getState: async () => {
      calls.push("state");
      return { account: GUEST, state, now: T0 };
    },
    upgrade: async () => {
      throw new Error("unused");
    },
    train: async () => {
      throw new Error("unused");
    },
    march: async (_t, target, _troops, heroes): Promise<MarchReply> => {
      calls.push(`march:${target}`);
      marchHeroes.push(heroes);
      return { ok: false, reason: "hero_busy", state, now: T0 };
    },
    heroRecruit: async (): Promise<HeroReply> => {
      calls.push("recruit");
      if (opts.fail === true) throw new Error("offline");
      const r = recruitHero(state, T0, seededRng(7));
      if (opts.serverState !== undefined) state = opts.serverState();
      else state = r.state;
      return r.ok
        ? { ok: true, state, now: T0, draw: { heroId: r.draw.heroId, rarity: r.draw.rarity, duplicate: r.draw.duplicate, forced: r.draw.forced } }
        : { ok: false, reason: r.reason, state, now: T0 };
    },
    heroLevel: async (_t, hero): Promise<HeroReply> => {
      calls.push(`level:${hero}`);
      const r = levelUpHero(state, hero);
      state = r.state;
      return r.ok ? { ok: true, state, now: T0 } : { ok: false, reason: r.reason, state, now: T0 };
    },
    storyClaim: async (): Promise<StoryReply> => {
      calls.push("claim");
      const r = claimChapter(state, T0);
      state = r.state;
      return r.ok ? { ok: true, state, now: T0 } : { ok: false, reason: r.reason, state, now: T0 };
    },
    getMap: async () => {
      throw new Error("unused");
    },
    getReports: async () => ({ reports: [], now: T0 }),
    signInWithGoogle: async () => {
      throw new Error("unused");
    },
  };
  return { api, calls, marchHeroes };
};

const connect = (f: ReturnType<typeof fakeApi>) => connectGameStore({ api: f.api, storage: memoryStorage(), clock: () => T0 });

describe("hero actions in the game store", () => {
  test("a recruit is not predicted: the server's draw is the new state and comes back with the result", async () => {
    const f = fakeApi(stocked());
    const store = await connect(f);
    const out = await store.recruitHero();
    expect(out.ok).toBe(true);
    if (!out.ok || out.draw === undefined) throw new Error("no draw");
    expect(store.state().heroes.owned[out.draw.heroId]?.level).toBe(1);
    expect(f.calls).toEqual(["state", "recruit"]);
  });

  test("the server has the last word on the roster", async () => {
    const f = fakeApi(stocked(), { serverState: () => withOwned(stocked()) });
    const store = await connect(f);
    await store.recruitHero();
    expect(store.state().heroes.owned).toEqual({ mountain_guide: { level: 1, shards: 20 } });
  });

  test("a refused recruit shows the server's reason; a refused level-up is refused locally without asking", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connect(f);
    expect(await store.recruitHero()).toEqual({ ok: false, reason: "hero_hall_level" });
    expect(await store.levelHero("mountain_guide")).toEqual({ ok: false, reason: "not_owned" });
    expect(await store.claimChapter()).toEqual({ ok: false, reason: "objectives_unmet" });
    expect(f.calls).toEqual(["state", "recruit"]);
  });

  test("an unreachable server resyncs and reports it", async () => {
    const f = fakeApi(stocked(), { fail: true });
    const store = await connect(f);
    expect(await store.recruitHero()).toEqual({ ok: false, reason: "unreachable" });
    await new Promise((r) => setTimeout(r, 0));
    expect(Object.keys(store.state().heroes.owned)).toHaveLength(0);
    expect(f.calls.filter((c) => c === "state").length).toBeGreaterThanOrEqual(2);
  });

  test("level up is predicted, and chapter claims follow the same path", async () => {
    const f = fakeApi(withOwned(stocked()));
    const store = await connect(f);
    expect(await store.levelHero("mountain_guide")).toEqual({ ok: true });
    expect(store.state().heroes.owned.mountain_guide?.level).toBe(2);
    const ready: BaseState = { ...store.state(), levels: { ...store.state().levels, hq: 2 } };
    const g = fakeApi(ready);
    const store2 = await connect(g);
    expect(await store2.claimChapter()).toEqual({ ok: true });
    expect(store2.state().story.chapter).toBe(1);
    expect(g.calls).toEqual(["state", "claim"]);
  });

  test("marches pass the chosen loadout on and show the server's refusal", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connect(f);
    const loadout: HeroLoadout = { lead: "hill_commander", deputies: ["dock_foreman"] };
    const out = await store.march("npc-1", { infantry: 5, scouts: 0, heavy: 0, porters: 0 }, loadout);
    expect(out).toEqual({ ok: false, reason: "hero_busy" });
    expect(f.marchHeroes).toEqual([loadout]);
    await store.march("npc-1", { infantry: 5, scouts: 0, heavy: 0, porters: 0 });
    expect(f.marchHeroes[1]).toBeNull();
  });

  test("an unknown session is still a normal ApiError path", () => {
    expect(new ApiError(401, "unauthorized").status).toBe(401);
  });
});
