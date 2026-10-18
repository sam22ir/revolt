import { createBaseState, type BattleReport, type MapSnapshot } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import type { Api } from "../src/net/api.ts";
import type { MapSocket } from "../src/net/map-socket.ts";
import type { GameStore } from "../src/state/game-store.ts";
import { createWorldStore, mergeReports, SEEN_KEY } from "../src/state/world-store.ts";
import { REPORT, SNAPSHOT } from "./fixtures.ts";

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

const fakeSocket = () => {
  const snap = new Set<(s: MapSnapshot) => void>();
  const rep = new Set<(r: BattleReport) => void>();
  const base = new Set<() => void>();
  let starts = 0;
  let restarts = 0;
  const socket: MapSocket = {
    start: () => void starts++,
    stop: () => {},
    restart: () => void restarts++,
    onSnapshot: (fn) => (snap.add(fn), () => snap.delete(fn)),
    onReport: (fn) => (rep.add(fn), () => rep.delete(fn)),
    onBaseChanged: (fn) => (base.add(fn), () => base.delete(fn)),
  };
  return {
    socket,
    pushSnapshot: (s: MapSnapshot) => snap.forEach((f) => f(s)),
    pushReport: (r: BattleReport) => rep.forEach((f) => f(r)),
    pushBaseChanged: () => base.forEach((f) => f()),
    counts: () => ({ starts, restarts }),
  };
};

const fakeGame = () => {
  let resyncs = 0;
  const session = new Set<() => void>();
  const game = {
    token: () => "tok",
    resync: async () => void resyncs++,
    onSessionChange: (fn: () => void) => (session.add(fn), () => session.delete(fn)),
    state: () => createBaseState(0),
  } as unknown as GameStore;
  return { game, resyncs: () => resyncs, changeSession: () => session.forEach((f) => f()) };
};

const fakeApi = (map: MapSnapshot = SNAPSHOT, reports: BattleReport[] = []) =>
  ({
    getMap: async () => map,
    getReports: async () => ({ reports, now: 0 }),
  }) as unknown as Api;

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const report = (id: string, at: number): BattleReport => ({ ...REPORT, id, at });

describe("mergeReports", () => {
  test("dedupes by id, newest first, capped at 20", () => {
    const many = Array.from({ length: 25 }, (_, i) => report(`r${i}`, i));
    const merged = mergeReports([report("r3", 3)], many);
    expect(merged).toHaveLength(20);
    expect(merged[0]?.id).toBe("r24");
    expect(new Set(merged.map((r) => r.id)).size).toBe(20);
  });
});

describe("world store", () => {
  test("start connects the feed and loads the map and reports", async () => {
    const s = fakeSocket();
    const g = fakeGame();
    const world = createWorldStore({ api: fakeApi(SNAPSHOT, [report("a", 10)]), game: g.game, socket: s.socket, storage: memoryStorage() });
    world.start();
    world.start();
    await tick();
    expect(s.counts().starts).toBe(1);
    expect(world.snapshot()).toEqual(SNAPSHOT);
    expect(world.reports().map((r) => r.id)).toEqual(["a"]);
  });

  test("a newer snapshot from the feed replaces the older one, an older one does not", async () => {
    const s = fakeSocket();
    const world = createWorldStore({ api: fakeApi(), game: fakeGame().game, socket: s.socket, storage: memoryStorage() });
    world.start();
    await tick();
    s.pushSnapshot({ ...SNAPSHOT, now: 2000, marches: [] });
    expect(world.snapshot()?.now).toBe(2000);
    s.pushSnapshot({ ...SNAPSHOT, now: 1500 });
    expect(world.snapshot()?.now).toBe(2000);
  });

  test("base_changed resyncs the base", () => {
    const s = fakeSocket();
    const g = fakeGame();
    createWorldStore({ api: fakeApi(), game: g.game, socket: s.socket, storage: memoryStorage() });
    s.pushBaseChanged();
    expect(g.resyncs()).toBe(1);
  });

  test("a live report is announced as fresh and counts as unread until seen", async () => {
    const s = fakeSocket();
    const storage = memoryStorage();
    const world = createWorldStore({ api: fakeApi(), game: fakeGame().game, socket: s.socket, storage });
    const fresh: (BattleReport | null)[] = [];
    world.subscribeReports((_r, f) => fresh.push(f));
    s.pushReport(report("a", 100));
    s.pushReport(report("b", 200));
    expect(fresh.map((f) => f?.id)).toEqual(["a", "b"]);
    expect(world.unread()).toBe(2);
    world.markSeen();
    expect(world.unread()).toBe(0);
    expect(storage.getItem(SEEN_KEY)).toBe("200");
    s.pushReport(report("c", 300));
    expect(world.unread()).toBe(1);
  });

  test("what was seen in an earlier session stays seen", async () => {
    const world = createWorldStore({
      api: fakeApi(SNAPSHOT, [report("a", 100), report("b", 300)]),
      game: fakeGame().game,
      socket: fakeSocket().socket,
      storage: memoryStorage({ [SEEN_KEY]: "200" }),
    });
    world.start();
    await tick();
    expect(world.unread()).toBe(1);
  });

  test("a session change clears the old account's view and reconnects", async () => {
    const s = fakeSocket();
    const g = fakeGame();
    const world = createWorldStore({ api: fakeApi(SNAPSHOT, [report("a", 1)]), game: g.game, socket: s.socket, storage: memoryStorage() });
    world.start();
    await tick();
    g.changeSession();
    expect(s.counts().restarts).toBe(1);
    await tick();
    expect(world.snapshot()).toEqual(SNAPSHOT);
  });

  test("a failing map request is tolerated", async () => {
    const api = { getMap: async () => Promise.reject(new Error("x")), getReports: async () => Promise.reject(new Error("x")) } as unknown as Api;
    const world = createWorldStore({ api, game: fakeGame().game, socket: fakeSocket().socket, storage: memoryStorage() });
    world.start();
    await tick();
    expect(world.snapshot()).toBeNull();
    expect(world.reports()).toEqual([]);
  });
});
