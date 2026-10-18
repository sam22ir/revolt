import type { BattleReport, MapServerMessage, MapSnapshot } from "@revolt/rules";

/** The part of `WebSocket` we use, so tests can inject a fake. */
export interface SocketLike {
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  close: () => void;
}

export type SocketCtor = new (url: string, protocols: string[]) => SocketLike;

export interface Timers {
  readonly set: (fn: () => void, ms: number) => number;
  readonly clear: (handle: number) => void;
}

export const windowTimers: Timers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (handle) => window.clearTimeout(handle),
};

/** Wait before the n-th reconnect attempt; the last value repeats. */
export const RECONNECT_BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 10_000, 30_000];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isSnapshot = (v: unknown): v is MapSnapshot =>
  isRecord(v) &&
  typeof v.size === "number" &&
  typeof v.terrainSeed === "number" &&
  typeof v.now === "number" &&
  Array.isArray(v.bases) &&
  Array.isArray(v.npcs) &&
  Array.isArray(v.marches);

const isReport = (v: unknown): v is BattleReport =>
  isRecord(v) && typeof v.id === "string" && typeof v.at === "number" && typeof v.result === "string" && isRecord(v.target);

/**
 * Reads one WebSocket frame. Anything that is not a well-formed server message
 * (bad JSON, unknown type, wrong shape) is dropped, never thrown.
 */
export const parseMapMessage = (data: unknown): MapServerMessage | null => {
  if (typeof data !== "string") return null;
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(msg)) return null;
  if (msg.type === "map" && isSnapshot(msg.snapshot)) return { type: "map", snapshot: msg.snapshot };
  if (msg.type === "report" && isReport(msg.report)) return { type: "report", report: msg.report };
  if (msg.type === "base_changed" && typeof msg.now === "number") return { type: "base_changed", now: msg.now };
  return null;
};

export interface MapSocket {
  /** Connects, and keeps reconnecting with backoff until `stop`. */
  readonly start: () => void;
  readonly stop: () => void;
  /** Drops the current connection and connects again at once (e.g. after the token changed). */
  readonly restart: () => void;
  readonly onSnapshot: (fn: (snapshot: MapSnapshot) => void) => () => void;
  readonly onReport: (fn: (report: BattleReport) => void) => () => void;
  readonly onBaseChanged: (fn: () => void) => () => void;
}

export interface MapSocketDeps {
  /** `ws://…/v1/map/ws` */
  readonly url: string;
  /** Read on every connect, so a new token is picked up. */
  readonly token: () => string;
  readonly socket?: SocketCtor;
  readonly timers?: Timers;
}

/** The map feed: full snapshots on every change, reports for this player, and a nudge when the base changed. */
export const createMapSocket = (deps: MapSocketDeps): MapSocket => {
  const Ctor: SocketCtor = deps.socket ?? WebSocket;
  const timers = deps.timers ?? windowTimers;
  const snapshotListeners = new Set<(s: MapSnapshot) => void>();
  const reportListeners = new Set<(r: BattleReport) => void>();
  const baseListeners = new Set<() => void>();

  let running = false;
  let current: SocketLike | null = null;
  let retry: number | null = null;
  let attempt = 0;

  const detach = (): void => {
    if (retry !== null) timers.clear(retry);
    retry = null;
    const s = current;
    current = null;
    if (s === null) return;
    s.onopen = s.onmessage = s.onclose = s.onerror = null;
    try {
      s.close();
    } catch {
      // Already closed.
    }
  };

  const scheduleRetry = (): void => {
    if (!running || retry !== null) return;
    const wait = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)] ?? 30_000;
    attempt++;
    retry = timers.set(() => {
      retry = null;
      connect();
    }, wait);
  };

  const onFrame = (ev: MessageEvent): void => {
    const msg = parseMapMessage(ev.data);
    if (msg === null) return;
    // A live, well-formed feed ends the backoff.
    attempt = 0;
    if (msg.type === "map") for (const fn of snapshotListeners) fn(msg.snapshot);
    else if (msg.type === "report") for (const fn of reportListeners) fn(msg.report);
    else for (const fn of baseListeners) fn();
  };

  const connect = (): void => {
    detach();
    if (!running) return;
    let socket: SocketLike;
    try {
      socket = new Ctor(deps.url, ["revolt.v1", `auth.${deps.token()}`]);
    } catch {
      scheduleRetry();
      return;
    }
    current = socket;
    socket.onmessage = onFrame;
    // `error` is always followed by `close`; one retry path is enough.
    socket.onclose = () => {
      if (current !== socket) return;
      current = null;
      scheduleRetry();
    };
  };

  const subscribe = <T>(set: Set<T>, fn: T): (() => void) => {
    set.add(fn);
    return () => set.delete(fn);
  };

  return {
    start: () => {
      if (running) return;
      running = true;
      attempt = 0;
      connect();
    },
    stop: () => {
      running = false;
      detach();
    },
    restart: () => {
      if (!running) return;
      attempt = 0;
      connect();
    },
    onSnapshot: (fn) => subscribe(snapshotListeners, fn),
    onReport: (fn) => subscribe(reportListeners, fn),
    onBaseChanged: (fn) => subscribe(baseListeners, fn),
  };
};
