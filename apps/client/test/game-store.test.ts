import { createBaseState, startUpgrade, type BaseState, type BuildingId } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { ApiError, type AccountView, type Api, type IntentResult } from "../src/net/api.ts";
import { SESSION_KEY } from "../src/net/session.ts";
import { connectGameStore } from "../src/state/game-store.ts";
import { SAVE_KEY, serializeSave } from "../src/state/save.ts";

const T0 = Date.UTC(2026, 9, 1);
const GUEST: AccountView = { id: "acc-1", google: null };

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
