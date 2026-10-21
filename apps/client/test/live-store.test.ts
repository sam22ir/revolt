import type { EventsResponse, LeaderboardResponse, PassView, StoreView } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { ApiError, type Api } from "../src/net/api.ts";
import type { Analytics } from "../src/platform/analytics.ts";
import { devBilling, noopBilling, type Billing } from "../src/platform/billing.ts";
import { createLiveStore, MIN_REFRESH_MS, POLL_MS } from "../src/state/live-store.ts";
import { UNUSED_ALLIANCE_API } from "./fixtures.ts";

const EVENTS: EventsResponse = {
  now: 1,
  events: [{ key: "supply_route:1", id: "supply_route", startsAt: 0, endsAt: 10, active: false, score: 80, rank: 1, tier: 0, tiers: [{ score: 50 }], claimed: false, claimable: true, needsReview: false }],
};
const BOARD: LeaderboardResponse = { board: "power", event: null, entries: [{ rank: 1, name: "ABC234", score: 9, mine: true }], me: { rank: 1, score: 9 }, now: 1 };
const PASS: PassView = { season: 0, startsAt: 0, endsAt: 10, xp: 100, tier: 1, premium: false, claimedFree: 0, claimedPremium: 0, now: 1 };
const STORE: StoreView = {
  products: [],
  wallet: { speedupTokens: 0, usedTodayMs: 0, dailyCapMs: 1 },
  cosmetics: { owned: [], equipped: {} },
  canRedeem: true,
  now: 1,
};

const setup = (over: Partial<Api> = {}, billing: Billing = noopBilling) => {
  const calls: string[] = [];
  let clock = 1_000_000;
  const timers: { fn: () => void; ms: number; stopped: boolean }[] = [];
  const tracked: string[] = [];
  const analytics: Analytics = { track: (e) => void tracked.push(e) };
  const api: Api = {
    ...UNUSED_ALLIANCE_API,
    getEvents: async () => (calls.push("events"), EVENTS),
    getPass: async () => (calls.push("pass"), PASS),
    getStore: async () => (calls.push("store"), STORE),
    getLeaderboard: async (_t, board) => (calls.push(`board:${board}`), { ...BOARD, board }),
    ...over,
  } as Api;
  let resyncs = 0;
  const sessionListeners: (() => void)[] = [];
  const live = createLiveStore({
    api,
    billing,
    analytics,
    game: { token: () => "tok", account: () => ({ id: "a", handle: "ABC234", google: null }), resync: async () => void resyncs++, onSessionChange: (fn) => (sessionListeners.push(fn), () => undefined) },
    clock: () => clock,
    every: (fn, ms) => {
      const t = { fn, ms, stopped: false };
      timers.push(t);
      return () => void (t.stopped = true);
    },
  });
  return { live, calls, timers, tracked, resyncs: () => resyncs, advance: (ms: number) => void (clock += ms), changeSession: () => sessionListeners.forEach((f) => f()) };
};

describe("refreshing", () => {
  test("loads everything the panel shows and counts the rewards waiting", async () => {
    const s = setup();
    await s.live.refresh(true);
    expect(s.live.events()).toEqual(EVENTS);
    expect(s.live.pass()).toEqual(PASS);
    expect(s.live.board()?.board).toBe("power");
    expect(s.live.store()).toEqual(STORE);
    expect(s.live.badge()).toBe(1 + 1);
  });

  test("unforced refreshes are spaced out", async () => {
    const s = setup();
    await s.live.refresh();
    await s.live.refresh();
    expect(s.calls.filter((c) => c === "events")).toHaveLength(1);
    s.advance(MIN_REFRESH_MS);
    await s.live.refresh();
    expect(s.calls.filter((c) => c === "events")).toHaveLength(2);
  });

  test("polls only while the panel is open, on a slow timer", async () => {
    const s = setup();
    s.live.setOpen(true);
    expect(s.timers).toHaveLength(1);
    expect(s.timers[0]!.ms).toBe(POLL_MS);
    expect(s.tracked).toContain("live_open");
    s.live.setOpen(false);
    expect(s.timers[0]!.stopped).toBe(true);
    s.live.setOpen(true);
    s.live.setOpen(true);
    expect(s.timers.filter((t) => !t.stopped)).toHaveLength(1);
  });

  test("a failed refresh keeps the last answers and says offline", async () => {
    let fail = false;
    const s = setup({
      getEvents: async () => {
        if (fail) throw new Error("down");
        return EVENTS;
      },
    });
    await s.live.refresh(true);
    fail = true;
    await s.live.refresh(true);
    expect(s.live.events()).toEqual(EVENTS);
    expect(s.live.offline()).toBe(true);
    fail = false;
    await s.live.refresh(true);
    expect(s.live.offline()).toBe(false);
  });

  test("switching account forgets the old answers and drops late replies", async () => {
    let release: (() => void) | null = null;
    const s = setup({
      getEvents: () => new Promise<EventsResponse>((resolve) => void (release = () => resolve(EVENTS))),
    });
    const pending = s.live.refresh(true);
    s.changeSession();
    release!();
    await pending;
    expect(s.live.events()).toBeNull();
  });

  test("choosing a board asks for that board", async () => {
    const s = setup();
    await s.live.selectBoard("alliance");
    expect(s.live.board()?.board).toBe("alliance");
    expect(s.calls).toContain("board:alliance");
  });

  test("every change bumps the version, so the panel knows to redraw", async () => {
    const s = setup();
    const v = s.live.version();
    let notified = 0;
    s.live.subscribe(() => void notified++);
    await s.live.refresh(true);
    expect(s.live.version()).toBeGreaterThan(v);
    expect(notified).toBeGreaterThan(0);
  });
});

describe("claims and purchases", () => {
  test("a claim resyncs the base and refetches, and reports the server's refusal", async () => {
    const s = setup({ claimPass: async () => ({ ok: false, reason: "tier_unreached", now: 1 }), claimEvent: async () => ({ ok: true, reward: {}, now: 1 }) });
    expect(await s.live.claimPass(2, "free")).toEqual({ ok: false, reason: "tier_unreached" });
    expect(await s.live.claimEvent("supply_route:1")).toEqual({ ok: true });
    expect(s.resyncs()).toBe(2);
    expect(s.tracked).toContain("event_claim");
    expect(s.tracked).toContain("pass_claim_refused");
  });

  test("with no billing nothing is bought, and the server is never asked", async () => {
    let redeemed = 0;
    const s = setup({ redeem: async () => (redeemed++, { ok: true, duplicate: false, now: 1 }) }, noopBilling);
    expect(await s.live.buy("pass_premium")).toEqual({ ok: false, reason: "billing_unavailable" });
    expect(redeemed).toBe(0);
  });

  test("test billing hands the server a receipt and the purchase goes through it", async () => {
    const seen: { sku: string; provider: string; receipt: string }[] = [];
    const s = setup({ redeem: async (_t, sku, provider, receipt) => (seen.push({ sku, provider, receipt }), { ok: true, duplicate: false, now: 1 }) }, devBilling(() => 0.5));
    expect(await s.live.buy("bundle_small")).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ sku: "bundle_small", provider: "local" });
    expect(seen[0]!.receipt).toMatch(/^local-test:[A-Za-z0-9_-]{4,64}$/);
    expect(s.resyncs()).toBe(1);
  });

  test("two test purchases never share a receipt", async () => {
    const b = devBilling();
    const a = await b.purchase("bundle_small");
    const c = await b.purchase("bundle_small");
    expect(a.kind === "receipt" && c.kind === "receipt" && a.receipt !== c.receipt).toBe(true);
  });

  test("a cancelled purchase asks nothing of the server", async () => {
    let redeemed = 0;
    const cancelling: Billing = { available: true, purchase: async () => ({ kind: "cancelled" }) };
    const s = setup({ redeem: async () => (redeemed++, { ok: true, duplicate: false, now: 1 }) }, cancelling);
    expect(await s.live.buy("bundle_small")).toEqual({ ok: false, reason: "cancelled" });
    expect(redeemed).toBe(0);
  });

  test("a server that cannot check receipts is reported as such, not as being offline", async () => {
    const s = setup({ redeem: async () => { throw new ApiError(503, "billing_not_configured"); } }, devBilling());
    expect(await s.live.buy("bundle_small")).toEqual({ ok: false, reason: "billing_unavailable" });
    expect(s.live.offline()).toBe(false);
  });

  test("a lost connection during a claim is reported as unreachable", async () => {
    const s = setup({ claimEvent: async () => { throw new Error("down"); } });
    expect(await s.live.claimEvent("supply_route:1")).toEqual({ ok: false, reason: "unreachable" });
  });
});
