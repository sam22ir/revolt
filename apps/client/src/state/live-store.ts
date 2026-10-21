import type { CosmeticId, CosmeticSlot, EventsResponse, LeaderboardId, LeaderboardResponse, PassTrack, PassView, ProductSku, StoreView } from "@revolt/rules";
import type { HelpKind } from "@revolt/rules";
import { ApiError, type AccountView, type Api } from "../net/api.ts";
import type { Analytics } from "../platform/analytics.ts";
import type { Billing } from "../platform/billing.ts";
import { liveBadge } from "./live-view.ts";

/** What the server (or the network) said to a live action. `unavailable`: this build cannot buy anything. */
export type LiveOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export type LiveTab = "events" | "board" | "pass" | "store";

export interface LiveStore {
  readonly events: () => EventsResponse | null;
  readonly board: () => LeaderboardResponse | null;
  readonly pass: () => PassView | null;
  readonly store: () => StoreView | null;
  /** Rewards waiting: finished events and pass tiers you can claim. */
  readonly badge: () => number;
  /** The last request failed because the server could not be reached. */
  readonly offline: () => boolean;
  /** Bumped on every change, so a view can tell whether to redraw. */
  readonly version: () => number;
  readonly billing: Billing;
  /** Panel visible: refreshes now and then again on a timer, until closed. No socket: the free tier of Durable Objects is for the map and chat. */
  readonly setOpen: (open: boolean) => void;
  /** Refreshes everything the Live panel shows (at most once per `MIN_REFRESH_MS` unless forced). */
  readonly refresh: (force?: boolean) => Promise<void>;
  readonly selectBoard: (board: LeaderboardId, event?: string) => Promise<void>;
  readonly claimEvent: (key: string) => Promise<LiveOutcome>;
  readonly claimPass: (tier: number, track: PassTrack) => Promise<LiveOutcome>;
  readonly buy: (sku: ProductSku) => Promise<LiveOutcome>;
  readonly equip: (slot: CosmeticSlot, cosmetic: CosmeticId | null) => Promise<LiveOutcome>;
  readonly speedUp: (job: HelpKind, tokens: number) => Promise<LiveOutcome>;
  readonly subscribe: (fn: () => void) => () => void;
}

export const POLL_MS = 30_000;
export const MIN_REFRESH_MS = 10_000;

interface LiveDeps {
  readonly api: Api;
  readonly game: {
    readonly token: () => string;
    readonly account: () => AccountView;
    readonly resync: () => Promise<void>;
    readonly onSessionChange: (fn: () => void) => () => void;
  };
  readonly billing: Billing;
  readonly analytics: Analytics;
  /** Device clock, only for spacing refreshes. */
  readonly clock: () => number;
  /** Repeats `fn` every `ms` until the returned function is called. Injected so tests need no real timers. */
  readonly every: (fn: () => void, ms: number) => () => void;
}

/**
 * What the Live panel knows: events, a leaderboard, the pass and the store, all as the server last said. Refreshed when
 * the panel opens and on a slow timer while it stays open; claims and purchases refetch what they change. The server
 * decides every number; this only asks and shows.
 */
export const createLiveStore = ({ api, game, billing, analytics, clock, every }: LiveDeps): LiveStore => {
  let events: EventsResponse | null = null;
  let board: LeaderboardResponse | null = null;
  let pass: PassView | null = null;
  let store: StoreView | null = null;
  let offline = false;
  let version = 0;
  let selected: { board: LeaderboardId; event?: string } = { board: "power" };
  let lastRefresh = Number.NEGATIVE_INFINITY;
  let stopPolling: (() => void) | null = null;
  /** Bumped when the account changes, to drop late answers meant for the old one. */
  let epoch = 0;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    version++;
    for (const fn of listeners) fn();
  };

  const guarded = async <T>(run: () => Promise<T>): Promise<T | null> => {
    const mine = epoch;
    try {
      const r = await run();
      if (mine !== epoch) return null;
      return r;
    } catch (e) {
      if (mine !== epoch) return null;
      // A 4xx answer is the server saying no (e.g. billing not configured), not a lost connection.
      offline = !(e instanceof ApiError && e.status < 500);
      notify();
      return null;
    }
  };

  const refresh = async (force = false): Promise<void> => {
    if (!force && clock() - lastRefresh < MIN_REFRESH_MS) return;
    lastRefresh = clock();
    const token = game.token();
    // Each failed request below sets it again; a refresh where all answered clears it.
    offline = false;
    const [e, p, s, b] = await Promise.all([
      guarded(() => api.getEvents(token)),
      guarded(() => api.getPass(token)),
      guarded(() => api.getStore(token)),
      guarded(() => api.getLeaderboard(token, selected.board, selected.event)),
    ]);
    events = e ?? events;
    pass = p ?? pass;
    store = s ?? store;
    board = b ?? board;
    notify();
  };

  const act = async (name: string, run: () => Promise<{ ok: boolean; reason?: string }>, props?: Record<string, string | number | boolean>): Promise<LiveOutcome> => {
    const r = await guarded(run);
    if (r === null) return { ok: false, reason: "unreachable" };
    analytics.track(r.ok ? name : `${name}_refused`, props);
    // The base may have changed (a reward), and so did whatever the action touched.
    await Promise.all([game.resync(), refresh(true)]);
    return r.ok ? { ok: true } : { ok: false, reason: r.reason ?? "unknown" };
  };

  game.onSessionChange(() => {
    epoch++;
    events = board = pass = store = null;
    lastRefresh = Number.NEGATIVE_INFINITY;
    notify();
  });

  return {
    events: () => events,
    board: () => board,
    pass: () => pass,
    store: () => store,
    badge: () => liveBadge(events?.events ?? null, pass),
    offline: () => offline,
    version: () => version,
    billing,
    setOpen: (open) => {
      stopPolling?.();
      stopPolling = null;
      if (!open) return;
      analytics.track("live_open");
      void refresh(true);
      stopPolling = every(() => void refresh(true), POLL_MS);
    },
    refresh,
    selectBoard: async (id, event) => {
      selected = event === undefined ? { board: id } : { board: id, event };
      offline = false;
      const b = await guarded(() => api.getLeaderboard(game.token(), id, event));
      board = b ?? board;
      notify();
    },
    claimEvent: (key) => act("event_claim", () => api.claimEvent(game.token(), key)),
    claimPass: (tier, track) => act("pass_claim", () => api.claimPass(game.token(), tier, track), { track, tier }),
    buy: async (sku) => {
      analytics.track("store_buy", { sku });
      const got = await billing.purchase(sku);
      if (got.kind === "unavailable") return { ok: false, reason: "billing_unavailable" };
      if (got.kind === "cancelled") return { ok: false, reason: "cancelled" };
      const token = game.token();
      let r;
      try {
        r = await api.redeem(token, sku, got.provider, got.receipt);
      } catch (e) {
        // The server cannot check receipts at all (no billing configured): say so, rather than "offline".
        if (e instanceof ApiError && e.code === "billing_not_configured") return { ok: false, reason: "billing_unavailable" };
        offline = true;
        notify();
        return { ok: false, reason: "unreachable" };
      }
      await Promise.all([game.resync(), refresh(true)]);
      return r.ok ? { ok: true } : { ok: false, reason: r.reason };
    },
    equip: (slot, cosmetic) => act("cosmetic_equip", () => api.equip(game.token(), slot, cosmetic)),
    speedUp: (job, tokens) => act("speedup", () => api.speedUp(game.token(), job, tokens), { job, tokens }),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
};
