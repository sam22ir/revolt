import { terrainAt, type MapSnapshot } from "@revolt/rules";
import { test, vi } from "vitest";
import { runCleanup, STALE_GUEST_MS } from "../src/cleanup.ts";
import { scheduled } from "../src/scheduled.ts";
import { join, MANY_GUESTS, player, post, team, type Player } from "./alliance-helpers.ts";
import { body, DAY, HOUR, newGuest, T0, testMapApi, type Server } from "./harness.ts";
import { getMap } from "./map-helpers.ts";
import { LONG, rows } from "./rows.ts";

/** A tile clear of mountains, bases, targets and HQs where an HQ may go. */
const findFreeTile = (snap: MapSnapshot, wanted: (x: number, y: number) => boolean = () => true): { x: number; y: number } => {
  for (let x = 0; x < snap.size; x++) {
    for (let y = 0; y < snap.size; y++) {
      const clear = terrainAt(snap.terrainSeed, x, y) !== "mountain" && [...snap.bases, ...snap.npcs, ...snap.hqs].every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > 2);
      if (clear && wanted(x, y)) return { x, y };
    }
  }
  throw new Error("no tile");
};

const exists = async (s: Server, accountId: string): Promise<{ account: boolean; base: boolean }> => {
  const a = await s.env.DB.prepare("SELECT 1 AS x FROM accounts WHERE id = ?").bind(accountId).first();
  const b = await s.env.DB.prepare("SELECT 1 AS x FROM bases WHERE account_id = ?").bind(accountId).first();
  return { account: a !== null, base: b !== null };
};
const gone = { account: false, base: false };
const kept = { account: true, base: true };

/** A guest whose device logged out at `server.now`. */
const abandonedGuest = async (s: Server): Promise<string> => {
  const g = await newGuest(s);
  await s.request("POST", "/v1/logout", { token: g.token });
  return g.res.account.id as string;
};

const signIn = (s: Server, token: string, idToken: string): Promise<Response> => s.request("POST", "/v1/auth/google", { token, body: { idToken } });

test("cleanup of stale guests: grace periods, clock skew, limits, scheduled handler, reports", async () => {
  await rows(MANY_GUESTS, {
    "a guest with no session is deleted 30 days after it was last seen, with its base": async (s, ex) => {
      const id = await abandonedGuest(s);
      ex(await runCleanup(s.env.DB, T0 + STALE_GUEST_MS - 1), "a ms early").toMatchObject({ guests: 0 });
      ex(await exists(s, id)).toEqual(kept);
      ex(await runCleanup(s.env.DB, T0 + STALE_GUEST_MS), "on time").toMatchObject({ guests: 1 });
      ex(await exists(s, id)).toEqual(gone);
    },
    "a guest that still has a session is kept however long it is idle": async (s, ex) => {
      const g = await newGuest(s);
      await runCleanup(s.env.DB, T0 + 365 * DAY);
      ex(await exists(s, g.res.account.id)).toEqual(kept);
      s.now = T0 + 365 * DAY;
      ex((await s.request("GET", "/v1/state", { token: g.token })).status).toBe(200);
    },
    "a linked account with no session is kept": async (s, ex) => {
      const g = await newGuest(s);
      await signIn(s, g.token, await s.idToken("g-1"));
      await s.request("POST", "/v1/logout", { token: g.token });
      await runCleanup(s.env.DB, T0 + 365 * DAY);
      ex(await exists(s, g.res.account.id)).toEqual(kept);
    },
    "a recent base write keeps the grace period running": async (s, ex) => {
      const g = await newGuest(s);
      const id = g.res.account.id as string;
      s.now = T0 + 20 * DAY;
      await s.request("POST", "/v1/intent", { token: g.token, body: { type: "upgrade", building: "hq" } });
      // The session goes without stamping last_seen_at (as for rows from before migration 0003): only the base write counts.
      await s.env.DB.prepare("DELETE FROM sessions WHERE account_id = ?").bind(id).run();
      await runCleanup(s.env.DB, T0 + 20 * DAY + STALE_GUEST_MS - 1);
      ex(await exists(s, id), "a ms early").toEqual(kept);
      await runCleanup(s.env.DB, T0 + 20 * DAY + STALE_GUEST_MS);
      ex(await exists(s, id), "on time").toEqual(gone);
    },
    "a recent logout keeps an old guest for 30 more days": async (s, ex) => {
      const g = await newGuest(s);
      s.now = T0 + 100 * DAY;
      await s.request("POST", "/v1/logout", { token: g.token });
      await runCleanup(s.env.DB, T0 + 100 * DAY + STALE_GUEST_MS - 1);
      ex(await exists(s, g.res.account.id), "a ms early").toEqual(kept);
      await runCleanup(s.env.DB, T0 + 100 * DAY + STALE_GUEST_MS);
      ex(await exists(s, g.res.account.id), "on time").toEqual(gone);
    },
    "a guest left behind by a device switch is deleted after 30 days; the Google account is not": async (s, ex) => {
      const a = await newGuest(s);
      await signIn(s, a.token, await s.idToken("g-1"));
      s.now = T0 + HOUR;
      const b = await newGuest(s);
      const switched = await body(await signIn(s, b.token, await s.idToken("g-1")));
      ex(switched.switched).toBe(true);
      await runCleanup(s.env.DB, T0 + HOUR + STALE_GUEST_MS);
      ex(await exists(s, b.res.account.id), "left-behind guest").toEqual(gone);
      ex(await exists(s, a.res.account.id), "google account").toEqual(kept);
      ex((await s.request("GET", "/v1/state", { token: switched.token })).status).toBe(200);
    },
    "the clock going backwards deletes nothing extra": async (s, ex) => {
      const id = await abandonedGuest(s);
      await runCleanup(s.env.DB, T0 - 365 * DAY);
      ex(await exists(s, id)).toEqual(kept);
    },
    "activity stamped in the future (clock skew) keeps the guest": async (s, ex) => {
      s.now = T0 + 400 * DAY;
      const id = await abandonedGuest(s);
      await runCleanup(s.env.DB, T0 + 40 * DAY);
      ex(await exists(s, id)).toEqual(kept);
    },
    "each run deletes at most its limit; the rest go on the next run": async (s, ex) => {
      const db = s.env.DB;
      // One statement each rather than one insert per account.
      const seq = "WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 119)";
      await db.prepare(`${seq} INSERT INTO accounts (id, created_at) SELECT 'stale-' || i, ? FROM n`).bind(T0).run();
      await db.prepare(`${seq} INSERT INTO bases (account_id, state, version, updated_at) SELECT 'stale-' || i, '{}', 1, ? FROM n`).bind(T0).run();
      const later = T0 + STALE_GUEST_MS;
      ex(await runCleanup(s.env.DB, later, 70), "first run").toMatchObject({ guests: 70 });
      ex(await runCleanup(s.env.DB, later, 70), "second run").toMatchObject({ guests: 50 });
      ex(await runCleanup(s.env.DB, later, 70), "third run").toMatchObject({ guests: 0 });
      const left = await db.prepare("SELECT (SELECT COUNT(*) FROM accounts) + (SELECT COUNT(*) FROM bases) AS n").first<{ n: number }>();
      ex(left?.n).toBe(0);
    },
    "also deletes expired rate-limit windows": async (s, ex) => {
      await abandonedGuest(s);
      ex(await runCleanup(s.env.DB, T0 + 2 * HOUR)).toMatchObject({ guests: 0, rateWindows: 1, helpRequests: 0 });
    },
  });
}, LONG);

test("cleanup: scheduled handler, reports and the map", async () => {
  await rows(MANY_GUESTS, {
    "the Worker's scheduled handler runs it at the trigger's scheduled time": async (s, ex) => {
      const id = await abandonedGuest(s);
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      await scheduled(T0 + STALE_GUEST_MS, s.env, { map: () => ({ removeAccounts: async () => 0, removeAlliance: async () => undefined }) as never, room: () => ({ disband: async () => undefined }) as never });
      ex(log).toHaveBeenCalledWith("cleanup: 1 stale guests, 1 rate windows, 0 help requests deleted");
      log.mockRestore();
      ex(await exists(s, id)).toEqual(gone);
    },
    "a deleted guest's reports go with it, and its base leaves the map": async (s, ex) => {
      const g = await newGuest(s);
      const snap = await body(await s.request("GET", "/v1/map", { token: g.token }));
      const npc = snap.npcs.find((n: { level: number }) => n.level === 1);
      const sent = await body(await s.request("POST", "/v1/intent", { token: g.token, body: { type: "march", target: npc.id, troops: { infantry: 10 } } }));
      s.now = sent.state.marches[0].returnAt;
      await s.fireAlarm();
      await s.request("POST", "/v1/logout", { token: g.token });
      const id = g.res.account.id as string;
      const reports = async (): Promise<unknown> => s.env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE account_id = ?").bind(id).first();
      ex(await reports(), "before").toEqual({ n: 1 });
      const removed: string[][] = [];
      await runCleanup(s.env.DB, s.now + STALE_GUEST_MS, undefined, async (name, ids) => {
        ex(name).toBe("algeria-1");
        removed.push(ids);
        await s.map(name).host.run(s.now, (m) => m.removeAccounts(ids));
      });
      ex(removed).toEqual([[id]]);
      ex(await reports(), "after").toEqual({ n: 0 });
      ex(await exists(s, id)).toEqual(gone);
      const other = await newGuest(s);
      const after = await body(await s.request("GET", "/v1/map", { token: other.token }));
      ex(after.bases).toHaveLength(1);
    },
  });
}, LONG);

test("cleanup and alliances: succession, ending, ordering, failure, HQ sweep, help requests", async () => {
  /** A guest that logged out, so the next cleanup 30 days later deletes it (a leader, a member, ...). */
  const abandon = async (s: Server, token: string): Promise<void> => void (await s.request("POST", "/v1/logout", { token }));
  const rank = async (s: Server, id: string): Promise<string | null> =>
    (await s.env.DB.prepare("SELECT rank FROM alliance_members WHERE account_id = ?").bind(id).first<{ rank: string }>())?.rank ?? null;
  const later = (s: Server): number => s.now + STALE_GUEST_MS;
  await rows(MANY_GUESTS, {
    "a deleted leader's alliance goes to its oldest officer, else its oldest member": async (s, ex) => {
      // Members join at distinct times, so "oldest" is well defined (ties would fall back to a random account id).
      const t = await team(s, 1);
      const members: Player[] = [];
      for (let i = 0; i < 3; i++) {
        s.now += 1000;
        const m = await player(s);
        await join(s, m, t.allianceId);
        members.push(m);
      }
      const [first, second, third] = members as [Player, Player, Player];
      await post(s, t.leader, "/v1/alliance/promote", { handle: third.handle });
      await abandon(s, t.leader.token);
      await runCleanup(s.env.DB, later(s));
      ex(await rank(s, t.leader.id)).toBeNull();
      ex(await rank(s, third.id), "oldest officer").toBe("leader");
      ex([await rank(s, first.id), await rank(s, second.id)]).toEqual(["member", "member"]);
      // The next leader is deleted too: nobody is an officer, so the oldest member takes over.
      s.now = later(s);
      await abandon(s, third.token);
      await runCleanup(s.env.DB, later(s));
      ex(await rank(s, first.id), "oldest member").toBe("leader");
      const leaders = await s.env.DB.prepare("SELECT COUNT(*) AS n FROM alliance_members WHERE alliance_id = ? AND rank = 'leader'").bind(t.allianceId).first<{ n: number }>();
      ex(leaders?.n).toBe(1);
    },
    "a leader and the member who would succeed deleted together: the one who stays takes over": async (s, ex) => {
      const t = await team(s, 3);
      const [a, b] = t.members as [Player, Player];
      await abandon(s, t.leader.token);
      await abandon(s, a.token);
      await runCleanup(s.env.DB, later(s));
      ex(await rank(s, b.id)).toBe("leader");
      ex(await rank(s, a.id)).toBeNull();
    },
    "an alliance whose members are all deleted ends: row, HQ and chat room, help requests too": async (s, ex) => {
      const t = await team(s, 2);
      const m = t.members[0]!;
      await getMap(s, t.leader.token);
      await getMap(s, m.token);
      const row = await s.env.DB.prepare("SELECT state FROM bases WHERE account_id = ?").bind(m.id).first<{ state: string }>();
      const state = JSON.parse(row?.state ?? "{}");
      state.training = { troop: "infantry", count: 20, startedAt: T0, endsAt: T0 + 3_600_000 };
      await s.env.DB.prepare("UPDATE bases SET state = ? WHERE account_id = ?").bind(JSON.stringify(state), m.id).run();
      await post(s, m, "/v1/help/request", { kind: "training" });
      await post(s, t.leader, "/v1/help/give", { requestId: (await s.env.DB.prepare("SELECT id FROM help_requests").first<{ id: string }>())?.id });
      await abandon(s, t.leader.token);
      await abandon(s, m.token);
      const closed: string[] = [];
      await runCleanup(s.env.DB, later(s), undefined, async (name, ids, ended) => {
        for (const id of ended) closed.push(id);
        await s.map(name).host.run(s.now, (svc) => svc.removeAccounts(ids));
        for (const id of ended) s.room(id).host.disband();
      });
      ex(closed).toEqual([t.allianceId]);
      const count = async (sql: string): Promise<number> => (await s.env.DB.prepare(sql).first<{ n: number }>())?.n ?? -1;
      ex(await count("SELECT COUNT(*) AS n FROM alliances"), "alliances").toBe(0);
      ex(await count("SELECT COUNT(*) AS n FROM alliance_members"), "members").toBe(0);
      ex(await count("SELECT COUNT(*) AS n FROM help_requests"), "help requests").toBe(0);
      ex(await count("SELECT COUNT(*) AS n FROM help_given"), "help given").toBe(0);
      ex(await count("SELECT COUNT(*) AS n FROM accounts WHERE id IN ('" + t.leader.id + "', '" + m.id + "')"), "accounts").toBe(0);
    },
    "the map and rooms are cleaned BEFORE any database row is deleted": async (s, ex) => {
      const t = await team(s, 1);
      await abandon(s, t.leader.token);
      const seen: { accounts: number; alliances: number }[] = [];
      await runCleanup(s.env.DB, later(s), undefined, async () => {
        const a = await s.env.DB.prepare("SELECT COUNT(*) AS n FROM accounts WHERE id = ?").bind(t.leader.id).first<{ n: number }>();
        const b = await s.env.DB.prepare("SELECT COUNT(*) AS n FROM alliances").first<{ n: number }>();
        seen.push({ accounts: a?.n ?? -1, alliances: b?.n ?? -1 });
      });
      ex(seen).toEqual([{ accounts: 1, alliances: 1 }]);
    },
    "if cleaning the map fails nothing is deleted, and the next run finishes the job": async (s, ex) => {
      const t = await team(s, 1);
      await abandon(s, t.leader.token);
      let failure: unknown = null;
      try {
        await runCleanup(s.env.DB, later(s), undefined, async () => {
          throw new Error("map unreachable");
        });
      } catch (e) {
        failure = e;
      }
      ex(failure).toBeInstanceOf(Error);
      ex((failure as Error | null)?.message).toBe("map unreachable");
      ex(await rank(s, t.leader.id), "nothing deleted").toBe("leader");
      ex(await runCleanup(s.env.DB, later(s)), "next run").toMatchObject({ guests: 1 });
      ex(await rank(s, t.leader.id), "finished").toBeNull();
    },
    "the scheduled handler ends the room and the HQ of an emptied alliance": async (s, ex) => {
      const t = await team(s, 1);
      await abandon(s, t.leader.token);
      const ended: string[] = [];
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      await scheduled(later(s), s.env, {
        map: (_e, name) => ({ removeAccounts: async () => 0, hqAllianceIds: async () => [], removeAlliance: async (id: string) => void ended.push(`map:${name}:${id}`) }) as never,
        room: (_e, id) => ({ disband: async () => void ended.push(`room:${id}`) }) as never,
      });
      log.mockRestore();
      ex(ended).toEqual([`room:${t.allianceId}`, `map:algeria-1:${t.allianceId}`]);
    },
    "an HQ left on the map by a failed notice is dropped by the daily sweep; a live alliance's is kept": async (s, ex) => {
      const t = await team(s, 1);
      const snap = await getMap(s, t.leader.token);
      const live = await post(s, t.leader, "/v1/alliance/hq", findFreeTile(snap));
      ex(live).toMatchObject({ ok: true });
      const other = await team(s, 1, "Other", "OT");
      const snap2 = await getMap(s, other.leader.token);
      const spot = findFreeTile(snap2, (x) => Math.abs(x - (live.alliance as { hq: { x: number } }).hq.x) > 6);
      ex(await post(s, other.leader, "/v1/alliance/hq", spot)).toMatchObject({ ok: true });
      // The other alliance ends in D1 only, as when the map call after a leave fails.
      await s.env.DB.prepare("DELETE FROM alliance_members WHERE alliance_id = ?").bind(other.allianceId).run();
      await s.env.DB.prepare("DELETE FROM alliances WHERE id = ?").bind(other.allianceId).run();
      ex((await getMap(s, t.leader.token)).hqs, "before the sweep").toHaveLength(2);
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      await scheduled(later(s), s.env, { map: (_e, name) => testMapApi(s.map(name), name), room: () => ({ disband: async () => undefined }) as never });
      log.mockRestore();
      ex((await getMap(s, t.leader.token)).hqs.map((h) => h.tag), "after the sweep").toEqual(["FL"]);
    },
    "an account that gains a session before the batch runs is neither deleted nor replaced as leader": async (s, ex) => {
      const t = await team(s, 2);
      await abandon(s, t.leader.token);
      await runCleanup(s.env.DB, later(s), undefined, async () => {
        // The leader signs in again between planning and the write.
        await s.env.DB.prepare("INSERT INTO sessions (token_hash, account_id, created_at, last_used_at) VALUES ('h', ?, 1, 1)").bind(t.leader.id).run();
      });
      ex(await rank(s, t.leader.id)).toBe("leader");
      ex(await rank(s, t.members[0]!.id)).toBe("member");
    },
    "old help requests are dropped after a day": async (s, ex) => {
      const t = await team(s, 2);
      await s.env.DB.prepare("INSERT INTO help_requests (id, account_id, kind, job_started_at, ends_at, created_at, helps) VALUES ('r1', ?, 'training', 1, ?, 1, 0)").bind(t.leader.id, T0).run();
      ex(await runCleanup(s.env.DB, T0 + 24 * HOUR - 1), "a ms early").toMatchObject({ helpRequests: 0 });
      ex(await runCleanup(s.env.DB, T0 + 24 * HOUR + 1), "a day later").toMatchObject({ helpRequests: 1 });
    },
  });
}, LONG);
