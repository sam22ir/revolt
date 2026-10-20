import { claimChapter, createBaseState, levelUpHero, recruitHero, type BaseState, type HeroId } from "@revolt/rules";
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

/** A base that can recruit the courier and finish a level-up. */
const stocked = (): BaseState => {
  const s = createBaseState(T0);
  return { ...s, resources: { food: 900, materiel: 900, funds: 900, support: 100 }, heroes: { ...s.heroes, courier: { level: 0, shards: 40 } } };
};

/** A stand-in server that applies the shared rules, optionally lying or failing, so the tests can see which state wins. */
const fakeApi = (initial: BaseState, opts: { fail?: boolean; serverState?: () => BaseState } = {}) => {
  let state = initial;
  const calls: string[] = [];
  const marchHeroes: (readonly HeroId[] | undefined)[] = [];
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
    heroRecruit: async (_t, hero): Promise<HeroReply> => {
      calls.push(`recruit:${hero}`);
      if (opts.fail === true) throw new Error("offline");
      const r = recruitHero(state, hero, T0);
      if (opts.serverState !== undefined) state = opts.serverState();
      else state = r.state;
      return r.ok ? { ok: true, state, now: T0 } : { ok: false, reason: r.reason, state, now: T0 };
    },
    heroLevel: async (_t, hero): Promise<HeroReply> => {
      calls.push(`level:${hero}`);
      const r = levelUpHero(state, hero, T0);
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
  test("a recruit shows at once, then the server's answer replaces it", async () => {
    const f = fakeApi(stocked());
    const store = await connect(f);
    const seen: number[] = [];
    store.subscribe((s) => seen.push(s.heroes.courier.level));
    const pending = store.recruitHero("courier");
    // The prediction is in before the server has answered.
    expect(store.state().heroes.courier.level).toBe(1);
    expect(await pending).toEqual({ ok: true });
    expect(store.state().heroes.courier.level).toBe(1);
    expect(f.calls).toEqual(["state", "recruit:courier"]);
    expect(seen[0]).toBe(1);
  });

  test("the server has the last word when it disagrees with the prediction", async () => {
    const f = fakeApi(stocked(), { serverState: () => ({ ...stocked(), heroes: { ...stocked().heroes, courier: { level: 1, shards: 7 } } }) });
    const store = await connect(f);
    await store.recruitHero("courier");
    expect(store.state().heroes.courier).toEqual({ level: 1, shards: 7 });
  });

  test("a refusal from the local rules is returned without asking the server", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connect(f);
    expect(await store.recruitHero("courier")).toEqual({ ok: false, reason: "not_enough_shards" });
    expect(await store.levelHero("courier")).toEqual({ ok: false, reason: "not_recruited" });
    expect(await store.claimChapter()).toEqual({ ok: false, reason: "objectives_unmet" });
    expect(f.calls).toEqual(["state"]);
    expect(store.state().heroes.courier).toEqual({ level: 0, shards: 0 });
  });

  test("an unreachable server resyncs and reports it", async () => {
    const f = fakeApi(stocked(), { fail: true });
    const store = await connect(f);
    expect(await store.recruitHero("courier")).toEqual({ ok: false, reason: "unreachable" });
    // The failed prediction is dropped by a resync from the server's state.
    await new Promise((r) => setTimeout(r, 0));
    expect(store.state().heroes.courier.level).toBe(0);
    expect(f.calls.filter((c) => c === "state").length).toBeGreaterThanOrEqual(2);
  });

  test("level up and chapter claims follow the same path", async () => {
    const start = recruitHero(stocked(), "courier", T0);
    if (!start.ok) throw new Error(start.reason);
    const f = fakeApi({ ...start.state, heroes: { ...start.state.heroes, courier: { level: 1, shards: 20 } } });
    const store = await connect(f);
    expect(await store.levelHero("courier")).toEqual({ ok: true });
    expect(store.state().heroes.courier.level).toBe(2);
    const ready: BaseState = { ...store.state(), levels: { ...store.state().levels, hq: 2 } };
    const g = fakeApi(ready);
    const store2 = await connect(g);
    expect(await store2.claimChapter()).toEqual({ ok: true });
    expect(store2.state().story.chapter).toBe(1);
    expect(g.calls).toEqual(["state", "claim"]);
  });

  test("marches pass the chosen heroes on, lead first, and show the server's refusal", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connect(f);
    const out = await store.march("npc-1", { infantry: 5, scouts: 0, heavy: 0, porters: 0 }, ["medic", "courier"]);
    expect(out).toEqual({ ok: false, reason: "hero_busy" });
    expect(f.marchHeroes).toEqual([["medic", "courier"]]);
    await store.march("npc-1", { infantry: 5, scouts: 0, heavy: 0, porters: 0 });
    expect(f.marchHeroes[1]).toEqual([]);
  });

  test("an unknown session is still a normal ApiError path", () => {
    expect(new ApiError(401, "unauthorized").status).toBe(401);
  });
});
