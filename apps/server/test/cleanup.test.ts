import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runCleanup, STALE_GUEST_MS } from "../src/cleanup.ts";
import { scheduled } from "../src/scheduled.ts";
import { body, DAY, HOUR, newGuest, startServer, T0, type Server } from "./harness.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer();
});
afterEach(() => server.dispose());

const exists = async (accountId: string): Promise<{ account: boolean; base: boolean }> => {
  const db = server.env.DB;
  const a = await db.prepare("SELECT 1 AS x FROM accounts WHERE id = ?").bind(accountId).first();
  const b = await db.prepare("SELECT 1 AS x FROM bases WHERE account_id = ?").bind(accountId).first();
  return { account: a !== null, base: b !== null };
};
const gone = { account: false, base: false };
const kept = { account: true, base: true };

/** A guest whose device logged out at `server.now`. */
const abandonedGuest = async (): Promise<string> => {
  const g = await newGuest(server);
  await server.request("POST", "/v1/logout", { token: g.token });
  return g.res.account.id as string;
};

const signIn = (token: string, idToken: string): Promise<Response> =>
  server.request("POST", "/v1/auth/google", { token, body: { idToken } });

describe("stale guest cleanup", () => {
  test("a guest with no session is deleted 30 days after it was last seen, with its base", async () => {
    const id = await abandonedGuest();
    expect(await runCleanup(server.env.DB, T0 + STALE_GUEST_MS - 1)).toMatchObject({ guests: 0 });
    expect(await exists(id)).toEqual(kept);
    expect(await runCleanup(server.env.DB, T0 + STALE_GUEST_MS)).toMatchObject({ guests: 1 });
    expect(await exists(id)).toEqual(gone);
  });

  test("a guest that still has a session is kept however long it is idle", async () => {
    const g = await newGuest(server);
    await runCleanup(server.env.DB, T0 + 365 * DAY);
    expect(await exists(g.res.account.id)).toEqual(kept);
    server.now = T0 + 365 * DAY;
    expect((await server.request("GET", "/v1/state", { token: g.token })).status).toBe(200);
  });

  test("a linked account with no session is kept", async () => {
    const g = await newGuest(server);
    await signIn(g.token, await server.idToken("g-1"));
    await server.request("POST", "/v1/logout", { token: g.token });
    await runCleanup(server.env.DB, T0 + 365 * DAY);
    expect(await exists(g.res.account.id)).toEqual(kept);
  });

  test("a recent base write keeps the grace period running", async () => {
    const g = await newGuest(server);
    const id = g.res.account.id as string;
    server.now = T0 + 20 * DAY;
    await server.request("POST", "/v1/intent", { token: g.token, body: { type: "upgrade", building: "hq" } });
    // The session goes without stamping last_seen_at (as for rows from before migration 0003): only the base write counts.
    await server.env.DB.prepare("DELETE FROM sessions WHERE account_id = ?").bind(id).run();
    await runCleanup(server.env.DB, T0 + 20 * DAY + STALE_GUEST_MS - 1);
    expect(await exists(id)).toEqual(kept);
    await runCleanup(server.env.DB, T0 + 20 * DAY + STALE_GUEST_MS);
    expect(await exists(id)).toEqual(gone);
  });

  test("a recent logout keeps an old guest for 30 more days", async () => {
    const g = await newGuest(server);
    server.now = T0 + 100 * DAY;
    await server.request("POST", "/v1/logout", { token: g.token });
    await runCleanup(server.env.DB, T0 + 100 * DAY + STALE_GUEST_MS - 1);
    expect(await exists(g.res.account.id)).toEqual(kept);
    await runCleanup(server.env.DB, T0 + 100 * DAY + STALE_GUEST_MS);
    expect(await exists(g.res.account.id)).toEqual(gone);
  });

  test("a guest left behind by a device switch is deleted after 30 days; the Google account is not", async () => {
    const a = await newGuest(server);
    await signIn(a.token, await server.idToken("g-1"));
    server.now = T0 + HOUR;
    const b = await newGuest(server);
    const switched = await body(await signIn(b.token, await server.idToken("g-1")));
    expect(switched.switched).toBe(true);
    await runCleanup(server.env.DB, T0 + HOUR + STALE_GUEST_MS);
    expect(await exists(b.res.account.id)).toEqual(gone);
    expect(await exists(a.res.account.id)).toEqual(kept);
    expect((await server.request("GET", "/v1/state", { token: switched.token })).status).toBe(200);
  });

  test("the clock going backwards deletes nothing extra", async () => {
    const id = await abandonedGuest();
    await runCleanup(server.env.DB, T0 - 365 * DAY);
    expect(await exists(id)).toEqual(kept);
  });

  test("activity stamped in the future (clock skew) keeps the guest", async () => {
    server.now = T0 + 400 * DAY;
    const id = await abandonedGuest();
    await runCleanup(server.env.DB, T0 + 40 * DAY);
    expect(await exists(id)).toEqual(kept);
  });

  test("each run deletes at most its limit; the rest go on the next run", async () => {
    const db = server.env.DB;
    // One statement each: Miniflare's batch costs ~40 ms per statement.
    const seq = "WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 119)";
    await db.prepare(`${seq} INSERT INTO accounts (id, created_at) SELECT 'stale-' || i, ? FROM n`).bind(T0).run();
    await db.prepare(`${seq} INSERT INTO bases (account_id, state, version, updated_at) SELECT 'stale-' || i, '{}', 1, ? FROM n`).bind(T0).run();
    const later = T0 + STALE_GUEST_MS;
    expect(await runCleanup(server.env.DB, later, 70)).toMatchObject({ guests: 70 });
    expect(await runCleanup(server.env.DB, later, 70)).toMatchObject({ guests: 50 });
    expect(await runCleanup(server.env.DB, later, 70)).toMatchObject({ guests: 0 });
    const left = await db.prepare("SELECT (SELECT COUNT(*) FROM accounts) + (SELECT COUNT(*) FROM bases) AS n").first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  test("also deletes expired rate-limit windows", async () => {
    await abandonedGuest();
    expect(await runCleanup(server.env.DB, T0 + 2 * HOUR)).toEqual({ guests: 0, rateWindows: 1 });
  });

  test("the Worker's scheduled handler runs it at the trigger's scheduled time", async () => {
    const id = await abandonedGuest();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await scheduled(T0 + STALE_GUEST_MS, server.env, { map: () => ({ removeAccounts: async () => 0 }) as never });
    expect(log).toHaveBeenCalledWith("cleanup: 1 stale guests, 1 rate windows deleted");
    log.mockRestore();
    expect(await exists(id)).toEqual(gone);
  });

  test("a deleted guest's reports go with it, and its base leaves the map", async () => {
    const g = await newGuest(server);
    const snap = await body(await server.request("GET", "/v1/map", { token: g.token }));
    const npc = snap.npcs.find((n: { level: number }) => n.level === 1);
    const sent = await body(await server.request("POST", "/v1/intent", { token: g.token, body: { type: "march", target: npc.id, troops: { infantry: 10 } } }));
    server.now = sent.state.marches[0].returnAt;
    await server.fireAlarm();
    await server.request("POST", "/v1/logout", { token: g.token });
    const id = g.res.account.id as string;
    const reports = async (): Promise<unknown> => server.env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE account_id = ?").bind(id).first();
    expect(await reports()).toEqual({ n: 1 });
    const removed: string[][] = [];
    await runCleanup(server.env.DB, server.now + STALE_GUEST_MS, undefined, async (name, ids) => {
      expect(name).toBe("algeria-1");
      removed.push(ids);
      await server.map(name).host.run(server.now, (s) => s.removeAccounts(ids));
    });
    expect(removed).toEqual([[id]]);
    expect(await reports()).toEqual({ n: 0 });
    expect(await exists(id)).toEqual(gone);
    const other = await newGuest(server);
    const after = await body(await server.request("GET", "/v1/map", { token: other.token }));
    expect(after.bases).toHaveLength(1);
  });
});
