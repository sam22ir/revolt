import { isAllianceRank, type AllianceClientMessage, type AllianceServerMessage, type ChatMessage } from "@revolt/rules";
import { RECONNECT_BACKOFF_MS, windowTimers, type SocketLike, type Timers } from "./map-socket.ts";

/** What the alliance feed needs of a socket: the map feed's, plus sending chat. */
export interface AllianceSocketLike extends SocketLike {
  send: (data: string) => void;
}

export type AllianceSocketCtor = new (url: string, protocols: string[]) => AllianceSocketLike;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isChatMessage = (v: unknown): v is ChatMessage =>
  isRecord(v) &&
  typeof v.id === "number" &&
  Number.isFinite(v.id) &&
  typeof v.at === "number" &&
  typeof v.handle === "string" &&
  isAllianceRank(v.rank) &&
  typeof v.text === "string";

/**
 * Reads one WebSocket frame. Anything that is not a well-formed server message
 * (bad JSON, unknown type, wrong shape) is dropped, never thrown. Malformed
 * entries inside a history are dropped one by one.
 */
export const parseAllianceMessage = (data: unknown): AllianceServerMessage | null => {
  if (typeof data !== "string") return null;
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(msg)) return null;
  switch (msg.type) {
    case "history":
      return Array.isArray(msg.messages) ? { type: "history", messages: msg.messages.filter(isChatMessage) } : null;
    case "chat":
      return isChatMessage(msg.message) ? { type: "chat", message: msg.message } : null;
    case "members_changed":
    case "help_changed":
    case "kicked":
      return { type: msg.type };
    case "error":
      return msg.reason === "rate_limited" || msg.reason === "bad_text" ? { type: "error", reason: msg.reason } : null;
    default:
      return null;
  }
};

export interface AllianceSocket {
  /** Connects, and keeps reconnecting with backoff until `stop`, or until the server says `kicked`. */
  readonly start: () => void;
  readonly stop: () => void;
  /** Drops the current connection and connects again at once (e.g. after the token changed). */
  readonly restart: () => void;
  /** Sends a chat line. False when the socket is not open, so the caller can say so. */
  readonly send: (text: string) => boolean;
  readonly connected: () => boolean;
  readonly onMessage: (fn: (msg: AllianceServerMessage) => void) => () => void;
  /** Called with `true` when the socket opens and `false` when it closes. */
  readonly onConnection: (fn: (connected: boolean) => void) => () => void;
}

export interface AllianceSocketDeps {
  /** `ws://…/v1/alliance/ws` */
  readonly url: string;
  /** Read on every connect, so a new token is picked up. */
  readonly token: () => string;
  readonly socket?: AllianceSocketCtor;
  readonly timers?: Timers;
}

/** The alliance feed: chat history and live messages, and notices that members or help requests changed. */
export const createAllianceSocket = (deps: AllianceSocketDeps): AllianceSocket => {
  const Ctor: AllianceSocketCtor = deps.socket ?? WebSocket;
  const timers = deps.timers ?? windowTimers;
  const messageListeners = new Set<(m: AllianceServerMessage) => void>();
  const connectionListeners = new Set<(c: boolean) => void>();

  let running = false;
  let current: AllianceSocketLike | null = null;
  let open = false;
  let retry: number | null = null;
  let attempt = 0;

  const setOpen = (next: boolean): void => {
    if (open === next) return;
    open = next;
    for (const fn of connectionListeners) fn(next);
  };

  const detach = (): void => {
    if (retry !== null) timers.clear(retry);
    retry = null;
    const s = current;
    current = null;
    if (s !== null) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      try {
        s.close();
      } catch {
        // Already closed.
      }
    }
    setOpen(false);
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
    const msg = parseAllianceMessage(ev.data);
    if (msg === null) return;
    // A live, well-formed feed ends the backoff.
    attempt = 0;
    // No longer a member: the server closes the socket, and nothing here should bring it back.
    if (msg.type === "kicked") {
      running = false;
      detach();
    }
    for (const fn of messageListeners) fn(msg);
  };

  const connect = (): void => {
    detach();
    if (!running) return;
    let socket: AllianceSocketLike;
    try {
      socket = new Ctor(deps.url, ["revolt.v1", `auth.${deps.token()}`]);
    } catch {
      scheduleRetry();
      return;
    }
    current = socket;
    socket.onopen = () => {
      if (current === socket) setOpen(true);
    };
    socket.onmessage = onFrame;
    // `error` is always followed by `close`; one retry path is enough.
    socket.onclose = () => {
      if (current !== socket) return;
      current = null;
      setOpen(false);
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
    send: (text) => {
      if (current === null || !open) return false;
      const msg: AllianceClientMessage = { type: "chat", text };
      try {
        current.send(JSON.stringify(msg));
        return true;
      } catch {
        return false;
      }
    },
    connected: () => open,
    onMessage: (fn) => subscribe(messageListeners, fn),
    onConnection: (fn) => subscribe(connectionListeners, fn),
  };
};
