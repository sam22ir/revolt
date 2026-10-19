import {
  createBaseState,
  planMarch,
  startMarch,
  startTraining,
  startUpgrade,
  type BaseState,
  type BuildingId,
  type MapSnapshot,
  type TroopId,
  type Troops,
} from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { ApiError, type AccountView, type Api, type IntentResult, type MarchReply, type TrainReply } from "../src/net/api.ts";
import { SESSION_KEY } from "../src/net/session.ts";
import { connectGameStore } from "../src/state/game-store.ts";
import { SAVE_KEY, serializeSave } from "../src/state/save.ts";
import { UNUSED_ALLIANCE_API } from "./fixtures.ts";

const T0 = Date.UTC(2026, 9, 1);
const GUEST: AccountView = { id: "acc-1", handle: "ABC234", google: null };

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

/** A stand-in server: it owns `serverState` and answers like the Worker. */
const fakeApi = (serverState: BaseState, validTokens = new Set(["tok-1"])) => {
  const calls: string[] = [];
  let state = serverState;
  let imported: BaseState | null = null;
  const api: Api = {
    ...UNUSED_ALLIANCE_API,
    createGuest: async (importSave) => {
      calls.push("guest");
      imported = importSave;
      validTokens.add("tok-new");
      return { token: "tok-new", account: GUEST, state, now: T0 };
    },
    getState: async (token) => {
      calls.push("state");
      if (!validTokens.has(token)) throw new ApiError(401, "unauthorized");
      return { account: GUEST, state, now: T0 };
    },
    upgrade: async (_token, building: BuildingId): Promise<IntentResult> => {
      calls.push(`upgrade:${building}`);
      const r = startUpgrade(state, building, T0);
      if (!r.ok) return { ok: false, reason: r.reason, state: r.state, now: T0 };
      state = r.state;
      return { ok: true, state, now: T0 };
    },
    train: async (_token, troop: TroopId, count: number): Promise<TrainReply> => {
      calls.push(`train:${troop}:${count}`);
      const r = startTraining(state, troop, count, T0);
      if (!r.ok) return { ok: false, reason: r.reason, state: r.state, now: T0 };
      state = r.state;
      return { ok: true, state, now: T0 };
    },
    march: async (_token, target: string, troops: Troops): Promise<MarchReply> => {
      calls.push(`march:${target}`);
      if (target === "gone") return { ok: false, reason: "target_gone", state, now: T0 };
      const timing = planMarch({ x: 0, y: 0 }, { x: 10, y: 10 }, troops, T0);
      const r = startMarch(state, { id: "m1", target: { npcId: target, level: 1, x: 10, y: 10 }, from: { x: 0, y: 0 }, troops, ...timing }, T0);
      if (!r.ok) return { ok: false, reason: r.reason, state: r.state, now: T0 };
      state = r.state;
      return { ok: true, state, now: T0 };
    },
    getMap: async (): Promise<MapSnapshot> => {
      throw new Error("unused");
    },
    getReports: async () => ({ reports: [], now: T0 }),
    signInWithGoogle: async () => {
      throw new Error("unused");
    },
  };
  return { api, calls, imported: () => imported };
};

describe("game store", () => {
  test("first launch creates a guest, imports the M1 save once and removes it", async () => {
    const m1 = { ...createBaseState(T0), levels: { hq: 2, farm: 1, armory: 1, treasury: 1, barracks: 1 } };
    const storage = memoryStorage({ [SAVE_KEY]: serializeSave(m1) });
    const f = fakeApi(createBaseState(T0));
    await connectGameStore({ api: f.api, storage, clock: () => T0 });
    expect(f.imported()).toEqual(m1);
    expect(storage.getItem(SESSION_KEY)).toBe("tok-new");
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });

  test("with a session, the server's base is used and a local save is ignored", async () => {
    const forged = { ...createBaseState(T0), resources: { food: 1e9, materiel: 1e9, funds: 1e9, support: 1e9 } };
    const storage = memoryStorage({ [SESSION_KEY]: "tok-1", [SAVE_KEY]: serializeSave(forged) });
    const f = fakeApi(createBaseState(T0));
    const store = await connectGameStore({ api: f.api, storage, clock: () => T0 });
    expect(store.state()).toEqual(createBaseState(T0));
    expect(f.calls).toEqual(["state"]);
  });

  test("an unknown token starts over as a new guest", async () => {
    const storage = memoryStorage({ [SESSION_KEY]: "tok-stale" });
    const f = fakeApi(createBaseState(T0));
    await connectGameStore({ api: f.api, storage, clock: () => T0 });
    expect(f.calls).toEqual(["state", "guest"]);
    expect(storage.getItem(SESSION_KEY)).toBe("tok-new");
  });

  test("the clock follows the server, not the device", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connectGameStore({ api: f.api, storage: memoryStorage({ [SESSION_KEY]: "tok-1" }), clock: () => T0 + 5_000_000 });
    expect(store.now()).toBe(T0);
  });

  test("an upgrade is predicted, sent as an intent, and the server's answer wins", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connectGameStore({ api: f.api, storage: memoryStorage({ [SESSION_KEY]: "tok-1" }), clock: () => T0 });
    store.upgrade("hq");
    expect(store.state().queue?.building).toBe("hq");
    await new Promise((r) => setTimeout(r, 0));
    expect(f.calls).toContain("upgrade:hq");
    expect(store.state().queue?.building).toBe("hq");
  });

  test("an upgrade the local rules refuse is never sent", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connectGameStore({ api: f.api, storage: memoryStorage({ [SESSION_KEY]: "tok-1" }), clock: () => T0 });
    store.upgrade("farm");
    expect(f.calls).not.toContain("upgrade:farm");
  });

  test("a failed intent falls back to the server's state", async () => {
    const f = fakeApi(createBaseState(T0));
    const api: Api = { ...f.api, upgrade: async () => Promise.reject(new Error("network")) };
    const store = await connectGameStore({ api, storage: memoryStorage({ [SESSION_KEY]: "tok-1" }), clock: () => T0 });
    store.upgrade("hq");
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(store.state()).toEqual(createBaseState(T0));
  });
});

const flush = async (): Promise<void> => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

const connect = async (api: Api) =>
  connectGameStore({ api, storage: memoryStorage({ [SESSION_KEY]: "tok-1" }), clock: () => T0 });

describe("game store: training and marches", () => {
  test("training is predicted at once, sent as an intent, and the server's answer wins", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connect(f.api);
    store.train("infantry", 5);
    expect(store.state().training?.count).toBe(5);
    expect(store.state().resources.food).toBe(500 - 5 * 20);
    await flush();
    expect(f.calls).toContain("train:infantry:5");
    expect(store.state().training?.troop).toBe("infantry");
  });

  test("training the local rules refuse is never sent", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connect(f.api);
    store.train("infantry", 999);
    await flush();
    expect(f.calls.some((c) => c.startsWith("train"))).toBe(false);
    expect(store.state().training).toBeNull();
  });

  test("a failed training request falls back to the server's state", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connect({ ...f.api, train: async () => Promise.reject(new Error("network")) });
    store.train("infantry", 5);
    await flush();
    expect(store.state()).toEqual(createBaseState(T0));
  });

  test("a march is not predicted: the state changes only with the server's answer", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connect(f.api);
    const pending = store.march("npc-1", { infantry: 4, scouts: 0, heavy: 0, porters: 0 });
    expect(store.state().marches).toHaveLength(0);
    expect(await pending).toEqual({ ok: true });
    expect(store.state().marches).toHaveLength(1);
    expect(store.state().troops.infantry).toBe(6);
  });

  test("a refused march returns the server's reason", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connect(f.api);
    expect(await store.march("npc-1", { infantry: 99, scouts: 0, heavy: 0, porters: 0 })).toEqual({ ok: false, reason: "not_enough_troops" });
    expect(await store.march("gone", { infantry: 1, scouts: 0, heavy: 0, porters: 0 })).toEqual({ ok: false, reason: "target_gone" });
    expect(store.state().marches).toHaveLength(0);
  });

  test("an unreachable server is reported, not thrown", async () => {
    const f = fakeApi(createBaseState(T0));
    const store = await connect({ ...f.api, march: async () => Promise.reject(new Error("network")) });
    expect(await store.march("npc-1", { infantry: 1, scouts: 0, heavy: 0, porters: 0 })).toEqual({ ok: false, reason: "unreachable" });
  });

  test("session listeners hear about a token change", async () => {
    const f = fakeApi(createBaseState(T0));
    const api: Api = { ...f.api, signInWithGoogle: async () => ({ token: "tok-2", account: GUEST, state: createBaseState(T0), now: T0, switched: true }) };
    const store = await connect(api);
    let heard = 0;
    store.onSessionChange(() => heard++);
    await store.signInWithGoogle("id-token");
    expect(heard).toBe(1);
    expect(store.token()).toBe("tok-2");
  });
});
