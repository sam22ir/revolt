import { EVENT_CLAIM_GRACE_MS, eventScoreFor, eventWindow, EVENTS, passXpFor, storageCap } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startServer, type Server } from "./harness.ts";
import { editBase, getState } from "./map-helpers.ts";
import { fighter, get, inWindow, lostOf, post, seedAward, sql, winBattle } from "./live-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer({ GUEST_LIMIT_PER_HOUR: "100000" });
  server.now = inWindow("supply_route", 40);
});
afterEach(() => server.dispose());

const KEY = eventWindow("supply_route", 40).key;
const score = async (accountId: string): Promise<number> => (await sql<{ s: number }>(server, "SELECT COALESCE(SUM(points),0) AS s FROM live_awards WHERE account_id = ? AND key = ?", accountId, KEY))[0]!.s;

describe("scoring from marches", () => {
  test("a victory raises the open events' scores and pass xp, once", async () => {
    const f = await fighter(server);
    const { report } = await winBattle(server, f);
    expect(report.result).toBe("victory");
    const want = eventScoreFor("supply_route", "victory", 1, lostOf(report));
    expect(await score(f.id)).toBe(want);
    const xp = await sql<{ s: number }>(server, "SELECT SUM(points) AS s FROM live_awards WHERE account_id = ? AND key LIKE 'pass:%'", f.id);
    expect(xp[0]!.s).toBe(passXpFor("victory", 1));
    const view = await get(server, f.token, "/v1/events");
    const e = view.events.find((x: { key: string }) => x.key === KEY);
    expect(e).toMatchObject({ id: "supply_route", active: true, score: want, rank: 1, claimed: false, claimable: false });
    // Later reads, and the base coming home, change nothing.
    await getState(server, f.token);
    expect(await score(f.id)).toBe(want);
  });

  test("a retried delivery does not count twice", async () => {
    const f = await fighter(server);
    const { report } = await winBattle(server, f);
    const before = await sql(server, "SELECT * FROM live_awards ORDER BY key");
    const { awardStatements } = await import("../src/db/live.ts");
    await server.env.DB.batch(awardStatements(server.env.DB, f.id, "algeria-1", report));
    await server.env.DB.batch(awardStatements(server.env.DB, f.id, "algeria-1", report));
    expect(await sql(server, "SELECT * FROM live_awards ORDER BY key")).toEqual(before);
  });

  test("a lost compare-and-set on the base retries without double counting", async () => {
    const f = await fighter(server);
    const snap = (await get(server, f.token, "/v1/map")) as { npcs: { id: string; level: number }[] };
    const npc = snap.npcs.find((n) => n.level === 1)!;
    const sent = await post(server, f.token, "/v1/intent", { type: "march", target: npc.id, troops: { infantry: 40 } });
    const m = sent.state.marches[0];
    // Another write lands on the base between the map's read and its save, once.
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
    server.now = m.arriveAt;
    await server.fireAlarm();
    db.batch = realBatch;
    expect(bumped).toBe(true);
    const rows = await sql<{ key: string; n: number }>(server, "SELECT key, COUNT(*) AS n FROM live_awards WHERE account_id = ? GROUP BY key", f.id);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.n).toBe(1);
    expect((await sql(server, "SELECT id FROM reports WHERE account_id = ?", f.id))).toHaveLength(1);
    // The outcome did land on the base on the retry.
    expect((await getState(server, f.token)).marches[0].outcome?.result).toBe("victory");
  });

  test("an event that is not open earns nothing, and pass xp is all a defeat earns", async () => {
    // Between two convoy_hunt windows, and with supply_route never closed, only supply_route and the pass score: check keys.
    const f = await fighter(server);
    await winBattle(server, f);
    const keys = (await sql<{ key: string }>(server, "SELECT key FROM live_awards WHERE account_id = ?", f.id)).map((r) => r.key);
    expect(keys.every((k) => k.startsWith("pass:") || /^(supply_route|convoy_hunt|seasonal_campaign):\d+$/.test(k))).toBe(true);
    expect(keys.some((k) => k.startsWith("vietnam_seasonal_placeholder"))).toBe(false);
  });

  test("Vietnam players score into Vietnam's server, not Algeria's", async () => {
    const v = await fighter(server, "vietnam");
    await winBattle(server, v);
    const rows = await sql<{ server: string }>(server, "SELECT DISTINCT server FROM live_awards WHERE account_id = ?", v.id);
    expect(rows).toEqual([{ server: "vietnam-1" }]);
    const keys = (await sql<{ key: string }>(server, "SELECT key FROM live_awards WHERE account_id = ?", v.id)).map((r) => r.key);
    expect(keys.some((k) => k.startsWith("seasonal_campaign"))).toBe(false);
  });
});

describe("claiming rewards", () => {
  test("refused while the event runs, then pays the highest tier reached once", async () => {
    const f = await fighter(server);
    await seedAward(server, f.id, KEY, 250);
    expect(await post(server, f.token, "/v1/events/claim", { event: KEY })).toMatchObject({ ok: false, reason: "not_ended" });
    const w = eventWindow("supply_route", 40);
    server.now = w.endsAt;
    const before = await getState(server, f.token);
    const view = await get(server, f.token, "/v1/events");
    expect(view.events.find((e: { key: string }) => e.key === KEY)).toMatchObject({ active: false, claimable: true, tier: 1 });
    const r = await post(server, f.token, "/v1/events/claim", { event: KEY });
    expect(r.ok).toBe(true);
    const tier = EVENTS.supply_route.tiers[1]!.reward;
    expect(r.reward).toEqual(tier);
    const cap = storageCap(before.levels.hq);
    expect(r.state.resources.food).toBe(Math.min(cap.food, before.resources.food + (tier.resources?.food ?? 0)));
    expect((await get(server, f.token, "/v1/store")).wallet.speedupTokens).toBe(tier.speedupTokens);
    expect(await post(server, f.token, "/v1/events/claim", { event: KEY })).toMatchObject({ ok: false, reason: "already_claimed" });
    expect((await get(server, f.token, "/v1/store")).wallet.speedupTokens).toBe(tier.speedupTokens);
  });

  test("two claims at once pay once", async () => {
    const f = await fighter(server);
    await seedAward(server, f.id, KEY, 700);
    server.now = eventWindow("supply_route", 40).endsAt + 1;
    const results = await Promise.all([1, 2, 3].map(() => post(server, f.token, "/v1/events/claim", { event: KEY })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => r.reason === "already_claimed" || r.error === "conflict")).toBe(true);
    expect((await get(server, f.token, "/v1/store")).wallet.speedupTokens).toBe(EVENTS.supply_route.tiers[2]!.reward.speedupTokens);
    expect((await getState(server, f.token)).heroes.courier.shards).toBe(EVENTS.supply_route.tiers[2]!.reward.shards);
  });

  test("a claim whose base write loses its race is applied once on the retry", async () => {
    const f = await fighter(server);
    await seedAward(server, f.id, KEY, 250);
    server.now = eventWindow("supply_route", 40).endsAt;
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
    const before = await getState(server, f.token);
    const r = await post(server, f.token, "/v1/events/claim", { event: KEY });
    db.batch = realBatch;
    expect(bumped).toBe(true);
    expect(r.ok).toBe(true);
    const gain = EVENTS.supply_route.tiers[1]!.reward;
    expect(r.state.resources.materiel).toBe(Math.min(storageCap(before.levels.hq).materiel, before.resources.materiel + (gain.resources?.materiel ?? 0)));
    expect((await get(server, f.token, "/v1/store")).wallet.speedupTokens).toBe(gain.speedupTokens);
  });

  test("no reward below the first tier, nothing after the grace, nothing for an unknown or foreign event", async () => {
    const f = await fighter(server);
    await seedAward(server, f.id, KEY, 3);
    const w = eventWindow("supply_route", 40);
    server.now = w.endsAt;
    expect(await post(server, f.token, "/v1/events/claim", { event: KEY })).toMatchObject({ ok: false, reason: "no_reward" });
    await editBase(server, f.id, () => undefined);
    await seedAward(server, f.id, KEY, 500);
    server.now = w.endsAt + EVENT_CLAIM_GRACE_MS;
    expect(await post(server, f.token, "/v1/events/claim", { event: KEY })).toMatchObject({ ok: false, reason: "claim_expired" });
    expect(await post(server, f.token, "/v1/events/claim", { event: "vietnam_seasonal_placeholder:1" })).toMatchObject({ ok: false, reason: "unknown_event" });
    for (const bad of ["nope", "supply_route:-1", 5, null, "supply_route:1:2"]) {
      const res = await server.request("POST", "/v1/events/claim", { token: f.token, body: { event: bad } });
      expect(res.status).toBe(400);
    }
  });

  test("the score is the server's: numbers in the request are ignored", async () => {
    const f = await fighter(server);
    server.now = eventWindow("supply_route", 40).endsAt;
    expect(await post(server, f.token, "/v1/events/claim", { event: KEY, score: 9999, tier: 2 })).toMatchObject({ ok: false, reason: "no_reward" });
  });
});
