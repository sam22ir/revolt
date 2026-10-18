import type { BattleReport, MapSnapshot } from "@revolt/rules";
import type { Api } from "../net/api.ts";
import type { MapSocket } from "../net/map-socket.ts";
import type { GameStore } from "./game-store.ts";

export const SEEN_KEY = "revolt.reports.seen";
/** The server keeps 20 reports per player. */
const MAX_REPORTS = 20;

export type SnapshotListener = (snapshot: MapSnapshot | null) => void;
/** `fresh` is the report that just arrived live, or null for a bulk reload. */
export type ReportsListener = (reports: readonly BattleReport[], fresh: BattleReport | null) => void;

export interface WorldStore {
  /** The latest map the server sent; null until the first one arrives. */
  readonly snapshot: () => MapSnapshot | null;
  /** Newest first. */
  readonly reports: () => readonly BattleReport[];
  /** Reports newer than the last one the player opened. */
  readonly unread: () => number;
  /** Everything received so far counts as read. */
  readonly markSeen: () => void;
  /** Connects the feed and loads the map and reports. Safe to call once. */
  readonly start: () => void;
  /** Loads the report list again (after being away). */
  readonly refreshReports: () => Promise<void>;
  readonly subscribeSnapshot: (fn: SnapshotListener) => () => void;
  readonly subscribeReports: (fn: ReportsListener) => () => void;
}

interface WorldDeps {
  readonly api: Api;
  readonly game: GameStore;
  readonly socket: MapSocket;
  readonly storage: Storage;
}

const loadSeen = (storage: Storage): number => {
  try {
    const n = Number(storage.getItem(SEEN_KEY));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};

const storeSeen = (storage: Storage, at: number): void => {
  try {
    storage.setItem(SEEN_KEY, String(at));
  } catch {
    // Blocked storage: the badge returns next launch.
  }
};

/** Merges by id, newest first, capped to what the server keeps. */
export const mergeReports = (current: readonly BattleReport[], incoming: readonly BattleReport[]): BattleReport[] => {
  const byId = new Map<string, BattleReport>();
  for (const r of [...current, ...incoming]) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, MAX_REPORTS);
};

/** The shared world as this client knows it: the map feed, battle reports, and which reports are new. */
export const createWorldStore = ({ api, game, socket, storage }: WorldDeps): WorldStore => {
  let snapshot: MapSnapshot | null = null;
  let reports: BattleReport[] = [];
  let seenAt = loadSeen(storage);
  let started = false;
  const snapshotListeners = new Set<SnapshotListener>();
  const reportListeners = new Set<ReportsListener>();

  const setSnapshot = (next: MapSnapshot | null): void => {
    snapshot = next;
    for (const fn of snapshotListeners) fn(snapshot);
  };
  const setReports = (next: BattleReport[], fresh: BattleReport | null): void => {
    reports = next;
    for (const fn of reportListeners) fn(reports, fresh);
  };

  const loadMap = async (): Promise<void> => {
    try {
      const map = await api.getMap(game.token());
      // The feed may already have delivered something newer while this was in flight.
      if (snapshot === null || map.now >= snapshot.now) setSnapshot(map);
    } catch {
      // The feed sends a full snapshot on connect; nothing more to do here.
    }
  };

  const refreshReports = async (): Promise<void> => {
    try {
      const res = await api.getReports(game.token());
      setReports(mergeReports(reports, res.reports), null);
    } catch {
      // Offline: live reports and the next refresh still arrive.
    }
  };

  socket.onSnapshot((map) => {
    if (snapshot === null || map.now >= snapshot.now) setSnapshot(map);
  });
  socket.onReport((report) => setReports(mergeReports(reports, [report]), report));
  socket.onBaseChanged(() => void game.resync());

  game.onSessionChange(() => {
    // Another account's map and reports.
    reports = [];
    setSnapshot(null);
    setReports([], null);
    seenAt = loadSeen(storage);
    socket.restart();
    void loadMap();
    void refreshReports();
  });

  return {
    snapshot: () => snapshot,
    reports: () => reports,
    unread: () => reports.filter((r) => r.at > seenAt).length,
    markSeen: () => {
      const latest = reports.reduce((m, r) => Math.max(m, r.at), seenAt);
      if (latest === seenAt) return;
      seenAt = latest;
      storeSeen(storage, seenAt);
      for (const fn of reportListeners) fn(reports, null);
    },
    start: () => {
      if (started) return;
      started = true;
      socket.start();
      void loadMap();
      void refreshReports();
    },
    refreshReports,
    subscribeSnapshot: (fn) => {
      snapshotListeners.add(fn);
      return () => snapshotListeners.delete(fn);
    },
    subscribeReports: (fn) => {
      reportListeners.add(fn);
      return () => reportListeners.delete(fn);
    },
  };
};
