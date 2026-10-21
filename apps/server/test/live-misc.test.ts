import { readFileSync } from "node:fs";
import { PASS_SEASON_MS } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { BillingNotConfigured } from "../src/billing/billing.ts";
import { localBilling } from "../src/billing/local-billing.ts";
import { runCleanup, STALE_GUEST_MS } from "../src/cleanup.ts";
import { LIVE_RETENTION_MS, pruneLive } from "../src/db/live-prune.ts";
import { productionDeps } from "../src/production-deps.ts";
import { scheduled } from "../src/scheduled.ts";
import { consoleAnalytics, noAnalytics } from "../src/telemetry.ts";
import { DAY, newGuest, startServer, T0, type Server } from "./harness.ts";
import { eventWindow } from "@revolt/rules";
import { fighter, inWindow, post, redeem, seedAward, sql } from "./live-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer({ GUEST_LIMIT_PER_HOUR: "100000" });
});
afterEach(() => server.dispose());

describe("billing wiring", () => {
  test("the deployed Worker has no test verifier: it cannot verify anything yet", async () => {
    const billing = productionDeps.billing(server.env);
    expect(billing.kind).not.toBe("local");
    expect(billing.configured).toBe(false);
    await expect(billing.verify("local", "pass_premium", "local-test:abcd")).rejects.toBeInstanceOf(BillingNotConfigured);
    // Even with the secret present it refuses until RevenueCat verification is written (docs/release.md).
    await expect(productionDeps.billing({ ...server.env, REVENUECAT_SECRET: "x" }).verify("google", "pass_premium", "r")).rejects.toBeInstanceOf(BillingNotConfigured);
  });

  test("no deployed entry module mentions the test verifier; only the e2e entry and tests do", () => {
    const src = (f: string): string => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
    for (const f of ["index.ts", "production-deps.ts", "app.ts", "env.ts", "billing/revenuecat-billing.ts"]) expect(src(f), f).not.toMatch(/local-billing|localBilling/);
    expect(src("e2e-entry.ts")).toContain("localBilling");
    // And the deployed config points at index.ts, not at the e2e entry.
    expect(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")).toContain('"main": "src/index.ts"');
  });

  test("the test verifier accepts only its own receipt shape from its own provider", async () => {
    expect(await localBilling.verify("local", "pass_premium", "local-test:abcd")).toEqual({ ok: true, txnId: "abcd" });
    for (const [p, r] of [["google", "local-test:abcd"], ["local", "local-test:ab"], ["local", "local-test:ab cd"], ["local", "abcd"], ["local", ""]] as const) {
      expect(await localBilling.verify(p, "pass_premium", r)).toEqual({ ok: false });
    }
  });

  test("telemetry defaults do nothing; events carry names and small props, never ids", async () => {
    const events: [string, unknown][] = [];
    server.analytics = { track: (e, p) => void events.push([e, p]) };
    const f = await fighter(server);
    await redeem(server, f.token, "speedup_pack_small", "txn-tele-1");
    expect(events.map((e) => e[0])).toContain("purchase");
    expect(JSON.stringify(events)).not.toContain(f.id);
    expect(JSON.stringify(events)).not.toContain(f.handle);
    expect(noAnalytics.track("x")).toBeUndefined();
    expect(typeof consoleAnalytics.track).toBe("function");
  });

  test("an unexpected error reaches the crash reporter and is rethrown", async () => {
    const captured: unknown[] = [];
    server.crash = { capture: (e) => void captured.push(e) };
    const f = await fighter(server);
    server.env.DB.prepare = () => {
      throw new Error("boom");
    };
    await expect(server.request("GET", "/v1/state", { token: f.token })).rejects.toThrow("boom");
    expect(captured).toHaveLength(1);
  });
});

describe("cleanup and housekeeping", () => {
  test("deleting a stale guest deletes its live rows too", async () => {
    const g = await newGuest(server);
    const id = g.res.account.id as string;
    await seedAward(server, id, "supply_route:1", 5);
    await redeem(server, g.token, "speedup_pack_small", "txn-clean-1");
    await server.env.DB.prepare("INSERT INTO score_snapshots (account_id, server, power, regions, updated_at) VALUES (?, 'algeria-1', 5, 0, ?)").bind(id, T0).run();
    await server.env.DB.prepare("INSERT INTO pass_premium (account_id, season) VALUES (?, 0)").bind(id).run();
    for (const t of ["live_awards", "claims", "wallet", "cosmetics", "purchases", "score_snapshots", "pass_premium"]) {
      if (t === "cosmetics") continue;
      expect((await sql(server, `SELECT 1 FROM ${t} WHERE account_id = ?`, id)).length, t).toBeGreaterThan(0);
    }
    await server.env.DB.prepare("INSERT INTO cosmetics (account_id, cosmetic, equipped) VALUES (?, 'banner_plain', 0)").bind(id).run();
    await server.request("POST", "/v1/logout", { token: g.token });
    const r = await runCleanup(server.env.DB, T0 + STALE_GUEST_MS);
    expect(r.guests).toBe(1);
    for (const t of ["live_awards", "claims", "wallet", "cosmetics", "purchases", "score_snapshots", "pass_premium"]) {
      expect(await sql(server, `SELECT 1 FROM ${t} WHERE account_id = ?`, id), t).toEqual([]);
    }
  });

  test("the scheduled run prunes old awards, claims and pass unlocks by the injected clock, and keeps recent ones", async () => {
    const f = await fighter(server);
    const now = T0 + 200 * DAY;
    await seedAward(server, f.id, "supply_route:1", 5, { at: now - LIVE_RETENTION_MS - 1, march: "old" });
    await seedAward(server, f.id, "supply_route:2", 5, { at: now - DAY, march: "new" });
    await server.env.DB.prepare("INSERT INTO claims (account_id, key, granted, at) VALUES (?, 'event:old', 1, ?), (?, 'event:new', 1, ?)").bind(f.id, now - LIVE_RETENTION_MS - 1, f.id, now - DAY).run();
    await server.env.DB.prepare("INSERT INTO pass_premium (account_id, season) VALUES (?, 0), (?, 99)").bind(f.id, f.id).run();
    const seasonNow = Math.floor((now - Date.UTC(2026, 0, 5)) / PASS_SEASON_MS);
    expect(seasonNow).toBeGreaterThan(3);
    await scheduled(now, server.env, { map: () => ({ removeAccounts: async () => 0, hqAllianceIds: async () => [], removeAlliance: async () => undefined }) as never, room: () => ({}) as never });
    expect((await sql<{ march_id: string }>(server, "SELECT march_id FROM live_awards")).map((r) => r.march_id)).toEqual(["new"]);
    expect((await sql<{ key: string }>(server, "SELECT key FROM claims")).map((r) => r.key)).toEqual(["event:new"]);
    expect((await sql<{ season: number }>(server, "SELECT season FROM pass_premium")).map((r) => r.season)).toEqual([99]);
  });

  test("pruning is repeatable and a missed run only leaves old rows a little longer", async () => {
    expect(await pruneLive(server.env.DB, T0)).toEqual({ awards: 0, claims: 0, premium: 0 });
    expect(await pruneLive(server.env.DB, T0 + 10_000 * DAY)).toEqual({ awards: 0, claims: 0, premium: 0 });
  });

  test("event windows roll over from the clock alone, with the cron never having run", async () => {
    const f = await fighter(server);
    server.now = inWindow("supply_route", 10);
    const a = (await (await server.request("GET", "/v1/events", { token: f.token })).json()) as { events: { key: string; active: boolean }[] };
    expect(a.events.find((e) => e.active && e.key.startsWith("supply_route"))?.key).toBe(eventWindow("supply_route", 10).key);
    server.now = inWindow("supply_route", 500);
    const b = (await (await server.request("GET", "/v1/events", { token: f.token })).json()) as { events: { key: string; active: boolean }[] };
    expect(b.events.find((e) => e.active && e.key.startsWith("supply_route"))?.key).toBe(eventWindow("supply_route", 500).key);
    expect(await post(server, f.token, "/v1/events/claim", { event: eventWindow("supply_route", 500).key })).toMatchObject({ reason: "not_ended" });
  });
});
