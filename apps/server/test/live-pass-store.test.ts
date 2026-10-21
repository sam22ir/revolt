import { PASS_TIERS, PASS_XP_PER_TIER, passSeasonAt, PRODUCTS, SPEEDUP_DAILY_CAP_MS, SPEEDUP_TOKEN_MS, storageCap, utcDay } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { noBilling } from "../src/billing/billing.ts";
import { DAY, startServer, type Server } from "./harness.ts";
import { create as createAlliance, join, player as allianceMember } from "./alliance-helpers.ts";
import { editBase, getState } from "./map-helpers.ts";
import { fighter, get, inWindow, post, redeem, seedAward, sql, winBattle } from "./live-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer({ GUEST_LIMIT_PER_HOUR: "100000" });
  server.now = inWindow("supply_route", 40);
});
afterEach(() => server.dispose());

const seasonKey = (): string => `pass:${passSeasonAt(server.now).index}`;

describe("battle pass", () => {
  test("xp comes from play and sets the tier", async () => {
    const f = await fighter(server);
    expect(await get(server, f.token, "/v1/pass")).toMatchObject({ xp: 0, tier: 0, premium: false });
    await winBattle(server, f);
    const p = await get(server, f.token, "/v1/pass");
    expect(p.xp).toBeGreaterThan(0);
    expect(p.tier).toBe(Math.floor(p.xp / PASS_XP_PER_TIER));
    expect(p.season).toBe(passSeasonAt(server.now).index);
  });

  test("free tiers pay once each; unreached and bad tiers are refused", async () => {
    const f = await fighter(server);
    expect(await post(server, f.token, "/v1/pass/claim", { tier: 1, track: "free" })).toMatchObject({ ok: false, reason: "tier_unreached" });
    await seedAward(server, f.id, seasonKey(), 3 * PASS_XP_PER_TIER);
    const before = await getState(server, f.token);
    const r = await post(server, f.token, "/v1/pass/claim", { tier: 2, track: "free" });
    expect(r.ok).toBe(true);
    const gain = PASS_TIERS[1]!.free.resources!.food!;
    expect(r.state.resources.food).toBe(Math.min(storageCap(before.levels.hq).food, before.resources.food + gain));
    expect(await post(server, f.token, "/v1/pass/claim", { tier: 2, track: "free" })).toMatchObject({ ok: false, reason: "already_claimed" });
    expect((await post(server, f.token, "/v1/pass/claim", { tier: 1, track: "free" })).ok).toBe(true);
    expect(await post(server, f.token, "/v1/pass/claim", { tier: 4, track: "free" })).toMatchObject({ ok: false, reason: "tier_unreached" });
    expect(await post(server, f.token, "/v1/pass/claim", { tier: 0, track: "free" })).toMatchObject({ ok: false, reason: "bad_tier" });
    const view = await get(server, f.token, "/v1/pass");
    expect(view.claimedFree).toBe(0b11);
    for (const bad of [{ tier: "1", track: "free" }, { tier: 1, track: "gold" }, {}]) {
      expect((await server.request("POST", "/v1/pass/claim", { token: f.token, body: bad })).status).toBe(400);
    }
  });

  test("the premium track needs the purchase, then pays cosmetics and tokens, and the free track stays free", async () => {
    const f = await fighter(server);
    await seedAward(server, f.id, seasonKey(), 6 * PASS_XP_PER_TIER);
    expect(await post(server, f.token, "/v1/pass/claim", { tier: 5, track: "premium" })).toMatchObject({ ok: false, reason: "premium_locked" });
    const bought = await redeem(server, f.token, "pass_premium", "txn-pass-1");
    expect(bought).toMatchObject({ ok: true, duplicate: false });
    expect(await get(server, f.token, "/v1/pass")).toMatchObject({ premium: true });
    expect((await post(server, f.token, "/v1/pass/claim", { tier: 3, track: "premium" })).ok).toBe(true);
    expect((await get(server, f.token, "/v1/store")).wallet.speedupTokens).toBe(PASS_TIERS[2]!.premium.speedupTokens);
    expect((await post(server, f.token, "/v1/pass/claim", { tier: 5, track: "premium" })).ok).toBe(true);
    const owned = (await get(server, f.token, "/v1/store")).cosmetics.owned;
    expect(owned).toContain(PASS_TIERS[4]!.premium.cosmetic);
    await editBase(server, f.id, (s) => {
      s.heroes.owned.mountain_guide = { level: 1, shards: 0 };
    });
    // Shards are never on the premium track: only the free tier 5 gives them.
    expect((await getState(server, f.token)).heroes.owned.mountain_guide.shards).toBe(0);
    expect((await post(server, f.token, "/v1/pass/claim", { tier: 5, track: "free" })).ok).toBe(true);
    expect((await getState(server, f.token)).heroes.owned.mountain_guide.shards).toBe(PASS_TIERS[4]!.free.shards);
  });

  test("a new season starts again from nothing; the premium unlock was for the old one", async () => {
    const f = await fighter(server);
    await seedAward(server, f.id, seasonKey(), 2 * PASS_XP_PER_TIER);
    await redeem(server, f.token, "pass_premium", "txn-pass-2");
    const old = passSeasonAt(server.now);
    server.now = old.endsAt + 1000;
    expect(await get(server, f.token, "/v1/pass")).toMatchObject({ season: old.index + 1, xp: 0, tier: 0, premium: false, claimedFree: 0 });
    // And the new season's pass can be bought again.
    expect(await redeem(server, f.token, "pass_premium", "txn-pass-3")).toMatchObject({ ok: true });
  });
});

describe("store", () => {
  test("lists the catalog with the wallet and whether receipts can be checked", async () => {
    const f = await fighter(server);
    const s = await get(server, f.token, "/v1/store");
    expect(s.products.map((p: { sku: string }) => p.sku)).toEqual(Object.keys(PRODUCTS));
    expect(s.canRedeem).toBe(true);
    expect(s.wallet).toEqual({ speedupTokens: 0, usedTodayMs: 0, dailyCapMs: SPEEDUP_DAILY_CAP_MS });
    expect((await server.request("GET", "/v1/store")).status).toBe(401);
  });

  test("a bad receipt, an unknown sku or provider grant nothing", async () => {
    const f = await fighter(server);
    expect(await post(server, f.token, "/v1/store/redeem", { sku: "speedup_pack_small", provider: "local", receipt: "nope" })).toMatchObject({ ok: false, reason: "bad_receipt" });
    expect(await post(server, f.token, "/v1/store/redeem", { sku: "speedup_pack_small", provider: "google", receipt: "local-test:abcd" })).toMatchObject({ ok: false, reason: "bad_receipt" });
    for (const b of [{ sku: "gold", provider: "local", receipt: "x" }, { sku: "pass_premium" }, { sku: 5, provider: "local", receipt: "x" }]) {
      expect((await server.request("POST", "/v1/store/redeem", { token: f.token, body: b })).status).toBe(400);
    }
    expect((await get(server, f.token, "/v1/store")).wallet.speedupTokens).toBe(0);
    expect(await sql(server, "SELECT * FROM purchases")).toEqual([]);
  });

  test("a purchase pays once per store transaction, and a repeat is acknowledged without paying again", async () => {
    const f = await fighter(server);
    expect(await redeem(server, f.token, "speedup_pack_small", "txn-aaaa")).toMatchObject({ ok: true, duplicate: false });
    expect(await redeem(server, f.token, "speedup_pack_small", "txn-aaaa")).toMatchObject({ ok: true, duplicate: true });
    expect((await get(server, f.token, "/v1/store")).wallet.speedupTokens).toBe(PRODUCTS.speedup_pack_small.grants.speedupTokens);
    expect(await sql(server, "SELECT status FROM purchases")).toEqual([{ status: "granted" }]);
    // The same transaction cannot be presented by another account, or for another product.
    const other = await fighter(server);
    expect(await redeem(server, other.token, "speedup_pack_small", "txn-aaaa")).toMatchObject({ ok: false, reason: "bad_receipt" });
    expect(await redeem(server, f.token, "speedup_pack_large", "txn-aaaa")).toMatchObject({ ok: false, reason: "bad_receipt" });
    expect((await get(server, other.token, "/v1/store")).wallet.speedupTokens).toBe(0);
  });

  test("the same transaction redeemed at once pays once", async () => {
    const f = await fighter(server);
    const rs = await Promise.all([1, 2, 3].map(() => redeem(server, f.token, "speedup_pack_small", "txn-race")));
    expect(rs.filter((r) => r.ok && !r.duplicate)).toHaveLength(1);
    expect((await get(server, f.token, "/v1/store")).wallet.speedupTokens).toBe(5);
  });

  test("a bundle puts resources in the base up to the storage cap, tokens in the wallet", async () => {
    const f = await fighter(server);
    const before = await getState(server, f.token);
    const r = await redeem(server, f.token, "bundle_small", "txn-bundle");
    expect(r.ok).toBe(true);
    const cap = storageCap(before.levels.hq);
    expect(r.state.resources.food).toBe(Math.min(cap.food, before.resources.food + 500));
    expect(r.state.resources.food).toBeLessThanOrEqual(cap.food);
    expect((await get(server, f.token, "/v1/store")).wallet.speedupTokens).toBe(2);
  });

  test("a purchase whose base write loses its race is applied once on the retry", async () => {
    const f = await fighter(server);
    const db = server.env.DB;
    const realBatch = db.batch.bind(db);
    let bumped = false;
    db.batch = async (stmts) => {
      if (!bumped) {
        bumped = true;
        await db.prepare("UPDATE bases SET version = version + 1 WHERE account_id = ?").bind(f.id).run();
      }
      return realBatch(stmts);
    };
    const r = await redeem(server, f.token, "bundle_small", "txn-race2");
    db.batch = realBatch;
    expect(bumped).toBe(true);
    expect(r).toMatchObject({ ok: true, duplicate: false });
    expect((await get(server, f.token, "/v1/store")).wallet.speedupTokens).toBe(2);
    expect(await sql(server, "SELECT COUNT(*) AS n FROM purchases")).toEqual([{ n: 1 }]);
    expect(await redeem(server, f.token, "bundle_small", "txn-race2")).toMatchObject({ duplicate: true });
    expect((await get(server, f.token, "/v1/store")).wallet.speedupTokens).toBe(2);
  });

  test("cosmetics can be owned once, worn, and swapped within their slot", async () => {
    const f = await fighter(server);
    expect(await redeem(server, f.token, "cosmetic_banner_plain", "txn-cos-1")).toMatchObject({ ok: true });
    expect(await redeem(server, f.token, "cosmetic_banner_plain", "txn-cos-2")).toMatchObject({ ok: false, reason: "already_owned" });
    expect((await get(server, f.token, "/v1/store")).products.find((p: { sku: string }) => p.sku === "cosmetic_banner_plain").owned).toBe(true);
    expect(await post(server, f.token, "/v1/cosmetics/equip", { slot: "banner", cosmetic: "banner_stripes" })).toMatchObject({ ok: false, reason: "not_owned" });
    const eq = await post(server, f.token, "/v1/cosmetics/equip", { slot: "banner", cosmetic: "banner_plain" });
    expect(eq.cosmetics.equipped).toEqual({ banner: "banner_plain" });
    expect((await server.request("POST", "/v1/cosmetics/equip", { token: f.token, body: { slot: "base_skin", cosmetic: "banner_plain" } })).status).toBe(400);
    expect((await post(server, f.token, "/v1/cosmetics/equip", { slot: "banner", cosmetic: null })).cosmetics.equipped).toEqual({});
  });

  test("daily limits apply per product per UTC day", async () => {
    const f = await fighter(server);
    const limit = PRODUCTS.speedup_pack_small.dailyLimit!;
    for (let i = 0; i < limit; i++) expect((await redeem(server, f.token, "speedup_pack_small", `txn-day-${i}`)).ok).toBe(true);
    expect(await redeem(server, f.token, "speedup_pack_small", "txn-day-x")).toMatchObject({ ok: false, reason: "daily_limit" });
    server.now += DAY;
    expect((await redeem(server, f.token, "speedup_pack_small", "txn-day-y")).ok).toBe(true);
  });

  test("concurrent redeems with different transactions cannot exceed the daily limit", async () => {
    const f = await fighter(server);
    const limit = PRODUCTS.speedup_pack_small.dailyLimit!;
    const results = await Promise.all(Array.from({ length: limit + 3 }, (_, i) => redeem(server, f.token, "speedup_pack_small", `txn-race-${i}`)));
    expect(results.filter((r) => r.ok === true)).toHaveLength(limit);
    expect(results.filter((r) => r.ok === false).every((r) => r.reason === "daily_limit")).toBe(true);
  });

  test("redeeming is rate limited per account", async () => {
    const f = await fighter(server);
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await server.request("POST", "/v1/store/redeem", { token: f.token, body: { sku: "pass_premium", provider: "local", receipt: "bad" } })).status;
    expect(last).toBe(429);
  });

  test("with no billing configured the store is browse-only and redeem answers 503", async () => {
    server.billing = noBilling;
    const f = await fighter(server);
    expect((await get(server, f.token, "/v1/store")).canRedeem).toBe(false);
    const res = await server.request("POST", "/v1/store/redeem", { token: f.token, body: { sku: "pass_premium", provider: "local", receipt: "local-test:abcd" } });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "billing_not_configured" });
  });
});

/** Ten minutes before a UTC midnight, so a few minutes of test time cross into the next day. */
const nearMidnight = (): number => (utcDay(server.now) + 1) * DAY - 10 * 60_000;

describe("speedup intent", () => {
  /** A base with a long farm upgrade running, and tokens in the wallet. */
  const withLongJob = async (tokens = 5) => {
    const f = await fighter(server);
    await editBase(server, f.id, (s) => {
      s.levels.hq = 9;
      s.levels.farm = 8;
      s.resources = { food: 50000, materiel: 50000, funds: 50000, support: 5000 };
    });
    // Tokens through the front door: packs of 5.
    await redeem(server, f.token, tokens > 5 ? "speedup_pack_large" : "speedup_pack_small", `txn-su-${f.id}`);
    const up = await post(server, f.token, "/v1/intent", { type: "upgrade", building: "farm" });
    if (!up.ok) throw new Error(up.reason);
    return { f, endsAt: up.state.queue.endsAt as number };
  };

  test("spends tokens to remove time from the running job, at server time", async () => {
    const { f, endsAt } = await withLongJob(5);
    const r = await post(server, f.token, "/v1/intent", { type: "speedup", job: "upgrade", tokens: 2 });
    expect(r.ok).toBe(true);
    expect(r.state.queue.endsAt).toBe(endsAt - 2 * SPEEDUP_TOKEN_MS);
    expect(r.wallet).toEqual({ speedupTokens: 3, usedTodayMs: 2 * SPEEDUP_TOKEN_MS, dailyCapMs: SPEEDUP_DAILY_CAP_MS });
    expect((await getState(server, f.token)).queue.endsAt).toBe(endsAt - 2 * SPEEDUP_TOKEN_MS);
  });

  test("ignores any time or amount the client claims; refuses without tokens or a job", async () => {
    const { f, endsAt } = await withLongJob(5);
    const r = await post(server, f.token, "/v1/intent", { type: "speedup", job: "upgrade", tokens: 1, ms: 99_999_999, endsAt: 0 });
    expect(r.state.queue.endsAt).toBe(endsAt - SPEEDUP_TOKEN_MS);
    expect(await post(server, f.token, "/v1/intent", { type: "speedup", job: "training", tokens: 1 })).toMatchObject({ ok: false, reason: "no_speedup_job" });
    const poor = await fighter(server);
    expect(await post(server, poor.token, "/v1/intent", { type: "speedup", job: "upgrade", tokens: 1 })).toMatchObject({ ok: false, reason: "too_few_tokens" });
    for (const b of [{ type: "speedup", job: "upgrade" }, { type: "speedup", job: "x", tokens: 1 }, { type: "speedup", job: "upgrade", tokens: "1" }]) {
      expect((await server.request("POST", "/v1/intent", { token: f.token, body: b })).status).toBe(400);
    }
  });

  test("never speeds the headquarters' own upgrade, however many tokens are held", async () => {
    const f = await fighter(server);
    await editBase(server, f.id, (s) => {
      s.resources = { food: 50000, materiel: 50000, funds: 50000, support: 5000 };
    });
    await redeem(server, f.token, "speedup_pack_small", "txn-hq-1");
    const up = await post(server, f.token, "/v1/intent", { type: "upgrade", building: "hq" });
    expect(up.ok).toBe(true);
    const r = await post(server, f.token, "/v1/intent", { type: "speedup", job: "upgrade", tokens: 1 });
    expect(r).toMatchObject({ ok: false, reason: "hq_job" });
    expect(r.state.queue.endsAt).toBe(up.state.queue.endsAt);
    expect(r.wallet.speedupTokens).toBe(5);
  });

  test("the daily cap holds across calls and resets the next UTC day", async () => {
    server.now = nearMidnight();
    const { f } = await withLongJob(25);
    const cap = SPEEDUP_DAILY_CAP_MS / SPEEDUP_TOKEN_MS;
    expect(cap).toBe(16);
    const a = await post(server, f.token, "/v1/intent", { type: "speedup", job: "upgrade", tokens: 10 });
    expect(a.wallet.usedTodayMs).toBe(10 * SPEEDUP_TOKEN_MS);
    const b = await post(server, f.token, "/v1/intent", { type: "speedup", job: "upgrade", tokens: 10 });
    expect(b.ok).toBe(true);
    expect(b.wallet.usedTodayMs).toBe(SPEEDUP_DAILY_CAP_MS);
    // 10 + 6 tokens' worth: the second call was clamped and charged only for the time it removed.
    expect(b.wallet.speedupTokens).toBe(25 - 16);
    expect(await post(server, f.token, "/v1/intent", { type: "speedup", job: "upgrade", tokens: 1 })).toMatchObject({ ok: false, reason: "daily_cap" });
    server.now += 20 * 60_000;
    const next = await post(server, f.token, "/v1/intent", { type: "speedup", job: "upgrade", tokens: 1 });
    expect(next.ok).toBe(true);
    expect(next.wallet.usedTodayMs).toBe(SPEEDUP_TOKEN_MS);
  });

  test("rewinding the clock does not reopen the allowance", async () => {
    server.now = nearMidnight();
    const { f } = await withLongJob(25);
    const a = await post(server, f.token, "/v1/intent", { type: "speedup", job: "upgrade", tokens: 20 });
    expect(a.wallet.usedTodayMs).toBe(SPEEDUP_DAILY_CAP_MS);
    server.now += 20 * 60_000;
    expect((await post(server, f.token, "/v1/intent", { type: "speedup", job: "upgrade", tokens: 1 })).ok).toBe(true);
    server.now -= 20 * 60_000;
    expect(await post(server, f.token, "/v1/intent", { type: "speedup", job: "upgrade", tokens: 1 })).toMatchObject({ ok: true });
    const w = (await get(server, f.token, "/v1/store")).wallet;
    expect(w.usedTodayMs).toBeGreaterThanOrEqual(2 * SPEEDUP_TOKEN_MS);
  });

  test("an alliance help request on a job that was then sped up to its end is gone, not applied twice", async () => {
    const leader = await allianceMember(server);
    const helper = await allianceMember(server);
    const made = await createAlliance(server, leader, "Dawn Guard", "DG");
    await join(server, helper, made.alliance.id);
    await editBase(server, leader.id, (s) => {
      s.levels.hq = 2;
      s.resources = { food: 5000, materiel: 5000, funds: 5000, support: 500 };
    });
    await redeem(server, leader.token, "speedup_pack_small", "txn-help-1");
    expect((await post(server, leader.token, "/v1/intent", { type: "upgrade", building: "farm" })).ok).toBe(true);
    const asked = await post(server, leader.token, "/v1/help/request", { kind: "upgrade" });
    expect(asked.ok).toBe(true);
    const sped = await post(server, leader.token, "/v1/intent", { type: "speedup", job: "upgrade", tokens: 1 });
    expect(sped.ok).toBe(true);
    const state = await getState(server, leader.token);
    expect(state.queue === null || state.queue.endsAt <= server.now).toBe(true);
    expect(await post(server, helper.token, "/v1/help/give", { requestId: asked.request.id })).toMatchObject({ ok: false, reason: "request_gone" });
  });
});
