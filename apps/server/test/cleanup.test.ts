import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runCleanup, STALE_GUEST_MS } from "../src/cleanup.ts";
import { scheduled } from "../src/scheduled.ts";
import { join, MANY_GUESTS, player, post, team, type Player } from "./alliance-helpers.ts";
import { body, DAY, HOUR, newGuest, startServer, T0, type Server } from "./harness.ts";
import { getMap } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer(MANY_GUESTS);
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
    expect(await runCleanup(server.env.DB, T0 + 2 * HOUR)).toMatchObject({ guests: 0, rateWindows: 1, helpRequests: 0 });
  });

  test("the Worker's scheduled handler runs it at the trigger's scheduled time", async () => {
    const id = await abandonedGuest();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await scheduled(T0 + STALE_GUEST_MS, server.env, { map: () => ({ removeAccounts: async () => 0, removeAlliance: async () => undefined }) as never, room: () => ({ disband: async () => undefined }) as never });
    expect(log).toHaveBeenCalledWith("cleanup: 1 stale guests, 1 rate windows, 0 help requests deleted");
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

describe("cleanup and alliances", () => {
  /** A guest that logged out, so the next cleanup 30 days later deletes it (a leader, a member, ...). */
  const abandon = async (token: string): Promise<void> => void (await server.request("POST", "/v1/logout", { token }));
  const rank = async (id: string): Promise<string | null> =>
    (await server.env.DB.prepare("SELECT rank FROM alliance_members WHERE account_id = ?").bind(id).first<{ rank: string }>())?.rank ?? null;
  const later = (): number => server.now + STALE_GUEST_MS;

  const ended: string[] = [];

  test("a deleted leader's alliance goes to its oldest officer, else its oldest member", async () => {
    // Members join at distinct times, so "oldest" is well defined (ties would fall back to a random account id).
    const t = await team(server, 1);
    const members: Player[] = [];
    for (let i = 0; i < 3; i++) {
      server.now += 1000;
      const m = await player(server);
      await join(server, m, t.allianceId);
      members.push(m);
    }
    const [first, second, third] = members as [Player, Player, Player];
    await post(server, t.leader, "/v1/alliance/promote", { handle: third.handle });
    await abandon(t.leader.token);
    await runCleanup(server.env.DB, later());
    expect(await rank(t.leader.id)).toBeNull();
    expect(await rank(third.id)).toBe("leader");
    expect([await rank(first.id), await rank(second.id)]).toEqual(["member", "member"]);
    // The next leader is deleted too: nobody is an officer, so the oldest member takes over.
    server.now = later();
    await abandon(third.token);
    await runCleanup(server.env.DB, later());
    expect(await rank(first.id)).toBe("leader");
    const leaders = await server.env.DB.prepare("SELECT COUNT(*) AS n FROM alliance_members WHERE alliance_id = ? AND rank = 'leader'").bind(t.allianceId).first<{ n: number }>();
    expect(leaders?.n).toBe(1);
  });

  test("a leader and the member who would succeed deleted together: the one who stays takes over", async () => {
    const t = await team(server, 3);
    const [a, b] = t.members as [Player, Player];
    await abandon(t.leader.token);
    await abandon(a.token);
    await runCleanup(server.env.DB, later());
    expect(await rank(b.id)).toBe("leader");
    expect(await rank(a.id)).toBeNull();
  });

  test("an alliance whose members are all deleted ends: row, HQ and chat room, help requests too", async () => {
    const t = await team(server, 2);
    const m = t.members[0]!;
    await getMap(server, t.leader.token);
    await getMap(server, m.token);
    const row = await server.env.DB.prepare("SELECT state FROM bases WHERE account_id = ?").bind(m.id).first<{ state: string }>();
    const state = JSON.parse(row?.state ?? "{}");
    state.training = { troop: "infantry", count: 20, startedAt: T0, endsAt: T0 + 3_600_000 };
    await server.env.DB.prepare("UPDATE bases SET state = ? WHERE account_id = ?").bind(JSON.stringify(state), m.id).run();
    await post(server, m, "/v1/help/request", { kind: "training" });
    await post(server, t.leader, "/v1/help/give", { requestId: (await server.env.DB.prepare("SELECT id FROM help_requests").first<{ id: string }>())?.id });
    await abandon(t.leader.token);
    await abandon(m.token);
    const closed: string[] = [];
    await runCleanup(server.env.DB, later(), undefined, async (name, ids, ended) => {
      for (const id of ended) closed.push(id);
      await server.map(name).host.run(server.now, (s) => s.removeAccounts(ids));
      for (const id of ended) server.room(id).host.disband();
    });
    expect(closed).toEqual([t.allianceId]);
    const count = async (sql: string): Promise<number> => (await server.env.DB.prepare(sql).first<{ n: number }>())?.n ?? -1;
    expect(await count("SELECT COUNT(*) AS n FROM alliances")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM alliance_members")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM help_requests")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM help_given")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM accounts WHERE id IN ('" + t.leader.id + "', '" + m.id + "')")).toBe(0);
  });

  test("the map and rooms are cleaned BEFORE any database row is deleted", async () => {
    const t = await team(server, 1);
    await abandon(t.leader.token);
    const seen: { accounts: number; alliances: number }[] = [];
    await runCleanup(server.env.DB, later(), undefined, async () => {
      const a = await server.env.DB.prepare("SELECT COUNT(*) AS n FROM accounts WHERE id = ?").bind(t.leader.id).first<{ n: number }>();
      const b = await server.env.DB.prepare("SELECT COUNT(*) AS n FROM alliances").first<{ n: number }>();
      seen.push({ accounts: a?.n ?? -1, alliances: b?.n ?? -1 });
    });
    expect(seen).toEqual([{ accounts: 1, alliances: 1 }]);
  });

  test("if cleaning the map fails nothing is deleted, and the next run finishes the job", async () => {
    const t = await team(server, 1);
    await abandon(t.leader.token);
    await expect(
      runCleanup(server.env.DB, later(), undefined, async () => {
        throw new Error("map unreachable");
      }),
    ).rejects.toThrow("map unreachable");
    expect(await rank(t.leader.id)).toBe("leader");
    expect(await runCleanup(server.env.DB, later())).toMatchObject({ guests: 1 });
    expect(await rank(t.leader.id)).toBeNull();
  });

  test("the scheduled handler ends the room and the HQ of an emptied alliance", async () => {
    const t = await team(server, 1);
    await abandon(t.leader.token);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await scheduled(later(), server.env, {
      map: (_e, name) => ({ removeAccounts: async () => 0, removeAlliance: async (id: string) => void ended.push(`map:${name}:${id}`) }) as never,
      room: (_e, id) => ({ disband: async () => void ended.push(`room:${id}`) }) as never,
    });
    log.mockRestore();
    expect(ended).toEqual([`room:${t.allianceId}`, `map:algeria-1:${t.allianceId}`]);
  });

  test("an account that gains a session before the batch runs is neither deleted nor replaced as leader", async () => {
    const t = await team(server, 2);
    await abandon(t.leader.token);
    await runCleanup(server.env.DB, later(), undefined, async () => {
      // The leader signs in again between planning and the write.
      await server.env.DB.prepare("INSERT INTO sessions (token_hash, account_id, created_at, last_used_at) VALUES ('h', ?, 1, 1)").bind(t.leader.id).run();
    });
    expect(await rank(t.leader.id)).toBe("leader");
    expect(await rank(t.members[0]!.id)).toBe("member");
  });

  test("old help requests are dropped after a day", async () => {
    const t = await team(server, 2);
    await server.env.DB.prepare("INSERT INTO help_requests (id, account_id, kind, job_started_at, ends_at, created_at, helps) VALUES ('r1', ?, 'training', 1, ?, 1, 0)").bind(t.leader.id, T0).run();
    expect(await runCleanup(server.env.DB, T0 + 24 * HOUR - 1)).toMatchObject({ helpRequests: 0 });
    expect(await runCleanup(server.env.DB, T0 + 24 * HOUR + 1)).toMatchObject({ helpRequests: 1 });
  });

});
