import {
  geographyOf,
  harvestCarry,
  harvestedAt,
  harvestTiming,
  MAP_SIZE,
  placeSites,
  seededRng,
  SITE_RESOURCE,
  storageCap,
  tileDistance,
  travelMs,
  type MapPoint,
  type MapSiteView,
  type MapSnapshot,
  type Troops,
} from "@revolt/rules";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import { MapService, PENDING_TIMEOUT_MS } from "../src/map/map-service.ts";
import type { MapSql } from "../src/map/map-sql.ts";
import { body, MIN, newGuest, T0, type Json, type Server } from "./harness.ts";
import { editBase, getMap, getState, intent, march, nearestNpc } from "./map-helpers.ts";
import { LONG, rows } from "./rows.ts";
import { sqliteDb } from "./sqlite-db.ts";

const troops = (infantry: number): Troops => ({ infantry, scouts: 0, heavy: 0, porters: 0 });

const mineOf = (snap: MapSnapshot): MapPoint => {
  const base = snap.bases.find((b) => b.mine);
  if (base === undefined) throw new Error("no base");
  return base;
};

/** The map's visible sites, nearest to the viewer's base first. */
const sitesNear = (snap: MapSnapshot): MapSiteView[] => {
  const mine = mineOf(snap);
  return [...(snap.sites ?? [])].sort((a, b) => tileDistance(mine, a) - tileDistance(mine, b));
};

const harvest = async (s: Server, token: string, site: string, n: number): Promise<Json> => body(await intent(s, token, { type: "harvest_start", site, troops: troops(n) }));
const recall = async (s: Server, token: string, marchId: string): Promise<Json> => body(await intent(s, token, { type: "harvest_recall", march: marchId }));

/** The timing the rules fix when a harvest of `n` infantry is sent from `from` to `site` at `now`. */
const plan = (from: MapPoint, site: MapSiteView, n: number, now = T0) => {
  const t = troops(n);
  const leg = travelMs(from, site, t);
  return { leg, ...harvestTiming(site, harvestCarry(t), now + leg, leg) };
};

test("harvest: the troops go out, the site is timed, and a second march is refused until the first is home", async () => {
  await rows({}, {
    "a harvest sends the troops to the site and deducts them, timed for arrival, leave and home": async (s, ex) => {
      const p = await newGuest(s);
      const snap = await getMap(s, p.token);
      const [site] = sitesNear(snap);
      const r = await harvest(s, p.token, site!.id, 5);
      const t = plan(mineOf(snap), site!, 5);
      ex(r.ok).toBe(true);
      ex(r.state.troops.infantry).toBe(5);
      ex(r.state.marches).toEqual([
        expect.objectContaining({
          siteId: site!.id,
          target: expect.objectContaining({ npcId: site!.id, level: 0 }),
          troops: troops(5),
          departAt: T0,
          arriveAt: t.arriveAt,
          returnAt: t.returnAt,
        }),
      ]);
      const after = await getMap(s, p.token);
      ex(after.marches[0]).toMatchObject({ siteId: site!.id, leaveSiteAt: t.leaveSiteAt, arriveAt: t.arriveAt });
    },
    "a site holds one march: the second is refused, and free again once the first is home": async (s, ex) => {
      const a = await newGuest(s);
      const b = await newGuest(s);
      const snap = await getMap(s, a.token);
      const [site] = sitesNear(snap);
      const first = await harvest(s, a.token, site!.id, 5);
      ex(first.ok).toBe(true);
      ex(await harvest(s, b.token, site!.id, 5)).toMatchObject({ ok: false, reason: "site_taken" });
      ex((await getMap(s, b.token)).sites?.find((x) => x.id === site!.id)).toMatchObject({ occupied: true, mine: false });
      s.now = first.state.marches[0].returnAt;
      await s.fireAlarm();
      ex(await harvest(s, b.token, site!.id, 5)).toMatchObject({ ok: true });
    },
    "a harvest of a site that does not exist is refused": async (s, ex) => {
      const p = await newGuest(s);
      await getMap(s, p.token);
      ex(await harvest(s, p.token, "farmland:999", 2)).toMatchObject({ ok: false, reason: "no_such_site" });
    },
    "a player with two marches out cannot send a harvest": async (s, ex) => {
      const p = await newGuest(s);
      const snap = await getMap(s, p.token);
      const [a, b, c] = sitesNear(snap);
      ex((await harvest(s, p.token, a!.id, 2)).ok).toBe(true);
      ex((await harvest(s, p.token, b!.id, 2)).ok).toBe(true);
      ex(await harvest(s, p.token, c!.id, 2)).toMatchObject({ ok: false, reason: "too_many_marches" });
    },
  });
}, LONG);

test("harvest: the load comes home and is capped by the carry and by storage", async () => {
  await rows({}, {
    "one infantry carries 10: the base gets exactly that, over a control base that sent nothing": async (s, ex) => {
      const p = await newGuest(s);
      const control = await newGuest(s);
      const snap = await getMap(s, p.token);
      await getMap(s, control.token);
      const [site] = sitesNear(snap);
      const res = SITE_RESOURCE[site!.kind];
      const r = await harvest(s, p.token, site!.id, 1);
      const t = plan(mineOf(snap), site!, 1);
      ex(harvestCarry(troops(1))).toBe(10);
      s.now = t.leaveSiteAt;
      await s.fireAlarm();
      s.now = t.returnAt;
      const after = await getState(s, p.token);
      const ctl = await getState(s, control.token);
      ex(after.resources[res] - ctl.resources[res]).toBe(10);
      ex(after.troops.infantry).toBe(10);
      ex(after.marches).toEqual([]);
      ex(r.ok).toBe(true);
    },
    "a recall pays the load gathered so far into the base, brings the troops home at the recalled time, and frees the site": async (s, ex) => {
      const p = await newGuest(s);
      const control = await newGuest(s);
      const snap = await getMap(s, p.token);
      await getMap(s, control.token);
      const [site] = sitesNear(snap);
      const res = SITE_RESOURCE[site!.kind];
      const r = await harvest(s, p.token, site!.id, 5);
      const t = plan(mineOf(snap), site!, 5);
      const recallAt = t.arriveAt + MIN;
      s.now = recallAt;
      ex((await recall(s, p.token, r.state.marches[0].id)).ok).toBe(true);
      s.now = recallAt + t.leg;
      await s.fireAlarm();
      const after = await getState(s, p.token);
      const ctl = await getState(s, control.token);
      ex(after.troops.infantry).toBe(10);
      ex(after.marches).toEqual([]);
      ex(after.resources[res] - ctl.resources[res]).toBe(harvestedAt(site!, harvestCarry(troops(5)), t.arriveAt, recallAt));
      ex(await harvest(s, p.token, site!.id, 5)).toMatchObject({ ok: true });
    },
    "a load never takes storage past its cap": async (s, ex) => {
      const p = await newGuest(s);
      const snap = await getMap(s, p.token);
      const [site] = sitesNear(snap);
      const res = SITE_RESOURCE[site!.kind];
      const before = await getState(s, p.token);
      const cap = storageCap(before.levels.hq)[res];
      await editBase(s, p.res.account.id, (st) => {
        st.resources[res] = cap - 3;
      });
      await harvest(s, p.token, site!.id, 1);
      const t = plan(mineOf(snap), site!, 1);
      s.now = t.leaveSiteAt;
      await s.fireAlarm();
      s.now = t.returnAt;
      ex((await getState(s, p.token)).resources[res]).toBe(cap);
    },
  });
}, LONG);

test("harvest: recall before arrival is refused, at the site it shortens the return, after the leave it is refused", async () => {
  await rows({}, {
    "a recall before the march has arrived is refused": async (s, ex) => {
      const p = await newGuest(s);
      const snap = await getMap(s, p.token);
      const [site] = sitesNear(snap);
      const r = await harvest(s, p.token, site!.id, 5);
      const t = plan(mineOf(snap), site!, 5);
      s.now = t.arriveAt - 1000;
      ex(await recall(s, p.token, r.state.marches[0].id)).toMatchObject({ ok: false, reason: "not_at_site" });
    },
    "a recall at the site brings the march home sooner, one leg after the recall": async (s, ex) => {
      const p = await newGuest(s);
      const snap = await getMap(s, p.token);
      const [site] = sitesNear(snap);
      const r = await harvest(s, p.token, site!.id, 5);
      const id = r.state.marches[0].id;
      const t = plan(mineOf(snap), site!, 5);
      s.now = t.arriveAt + MIN;
      const rec = await recall(s, p.token, id);
      ex(rec.ok).toBe(true);
      ex(rec.state.marches[0].returnAt).toBe(s.now + t.leg);
      ex(rec.state.marches[0].returnAt).toBeLessThan(t.returnAt);
      ex((await getMap(s, p.token)).marches[0]).toMatchObject({ leaveSiteAt: s.now, returnAt: s.now + t.leg });
    },
    "a recall once the scheduled leave has passed is refused": async (s, ex) => {
      const p = await newGuest(s);
      const snap = await getMap(s, p.token);
      const [site] = sitesNear(snap);
      const r = await harvest(s, p.token, site!.id, 5);
      const t = plan(mineOf(snap), site!, 5);
      s.now = t.leaveSiteAt;
      ex(await recall(s, p.token, r.state.marches[0].id)).toMatchObject({ ok: false, reason: "already_leaving" });
    },
    "a battle march is not a harvest, and cannot be recalled as one": async (s, ex) => {
      const p = await newGuest(s);
      const snap = await getMap(s, p.token);
      const m = await march(s, p.token, nearestNpc(snap).id, troops(2));
      ex(await recall(s, p.token, m.state.marches[0].id)).toMatchObject({ ok: false, reason: "not_harvest" });
    },
    "another player's march cannot be recalled": async (s, ex) => {
      const a = await newGuest(s);
      const b = await newGuest(s);
      const snap = await getMap(s, a.token);
      const [site] = sitesNear(snap);
      const r = await harvest(s, a.token, site!.id, 5);
      ex(await recall(s, b.token, r.state.marches[0].id)).toMatchObject({ error: "not_found" });
    },
  });
}, LONG);

test("harvest: the map shows who holds each site, and a base on a site tile hides it", async () => {
  await rows({}, {
    "sites carry occupied and mine flags, per viewer": async (s, ex) => {
      const a = await newGuest(s);
      const b = await newGuest(s);
      const snap = await getMap(s, a.token);
      const [site, other] = sitesNear(snap);
      ex(snap.sites?.every((x) => !x.occupied)).toBe(true);
      await harvest(s, a.token, site!.id, 5);
      const mine = (await getMap(s, a.token)).sites ?? [];
      const theirs = (await getMap(s, b.token)).sites ?? [];
      ex(mine.find((x) => x.id === site!.id)).toMatchObject({ occupied: true, mine: true });
      ex(theirs.find((x) => x.id === site!.id)).toMatchObject({ occupied: true, mine: false });
      ex(theirs.find((x) => x.id === other!.id)).toMatchObject({ occupied: false, mine: false });
    },
    "a base standing on a site tile hides that site, and no harvest can be sent there": async (s, ex) => {
      const p = await newGuest(s);
      const snap = await getMap(s, p.token);
      const [site] = sitesNear(snap);
      s.map().sql.exec("INSERT INTO map_bases (account_id, tag, x, y, created_at) VALUES ('ghost', 'Ghost', ?, ?, ?)", site!.x, site!.y, T0);
      const after = await getMap(s, p.token);
      ex(after.sites?.some((x) => x.id === site!.id)).toBe(false);
      ex(await harvest(s, p.token, site!.id, 2)).toMatchObject({ ok: false, reason: "no_such_site" });
    },
  });
}, LONG);

test("harvest: the alarm wakes the map at arrival, at the leave, and at the return", async () => {
  await rows({}, {
    "the next wake-up is the arrival, then the leave, then the return": async (s, ex) => {
      const p = await newGuest(s);
      const snap = await getMap(s, p.token);
      const [site] = sitesNear(snap);
      await harvest(s, p.token, site!.id, 5);
      const t = plan(mineOf(snap), site!, 5);
      ex(s.map().alarmAt).toBe(t.leg);
      s.now = t.arriveAt;
      await s.fireAlarm();
      ex(s.map().alarmAt).toBe(t.leaveSiteAt - t.arriveAt);
      s.now = t.leaveSiteAt;
      await s.fireAlarm();
      ex(s.map().alarmAt).toBe(t.returnAt - t.leaveSiteAt);
    },
  });
}, LONG);

test("harvest: a pending march that times out gives its troops back, or frees the site if the base never took it", async () => {
  await rows({}, {
    "a pending harvest the base never wrote is dropped, the site is free, the troops are still home": async (s, ex) => {
      const p = await newGuest(s);
      const snap = await getMap(s, p.token);
      const [site] = sitesNear(snap);
      s.map().sql.exec(
        `INSERT INTO marches (id, account_id, npc_id, npc_level, from_x, from_y, to_x, to_y, troops, seed, depart_at, arrive_at, return_at, phase, site_id, leave_site_at)
         VALUES ('ghost', ?, ?, 0, 0, 0, ?, ?, ?, 0, ?, ?, ?, 'pending', ?, ?)`,
        p.res.account.id, site!.id, site!.x, site!.y, JSON.stringify(troops(5)), T0, T0 + 1000, T0 + 2000, site!.id, T0 + 1500,
      );
      s.now = T0 + PENDING_TIMEOUT_MS;
      await s.fireAlarm();
      ex(s.map().sql.exec("SELECT id FROM marches WHERE id = 'ghost'")).toEqual([]);
      ex((await getState(s, p.token)).troops.infantry).toBe(10);
      ex(await harvest(s, p.token, site!.id, 5)).toMatchObject({ ok: true });
    },
    "a pending harvest the base did take resumes, and the troops come home": async (s, ex) => {
      const p = await newGuest(s);
      const snap = await getMap(s, p.token);
      const [site] = sitesNear(snap);
      const r = await harvest(s, p.token, site!.id, 5);
      const id = r.state.marches[0].id;
      s.map().sql.exec("UPDATE marches SET phase = 'pending' WHERE id = ?", id);
      s.now = T0 + PENDING_TIMEOUT_MS;
      await s.fireAlarm();
      const t = plan(mineOf(snap), site!, 5);
      s.now = t.leaveSiteAt;
      await s.fireAlarm();
      s.now = t.returnAt;
      const st = await getState(s, p.token);
      ex(st.troops.infantry).toBe(10);
      ex(st.marches).toEqual([]);
    },
  });
}, LONG);

test("harvest: a map created before harvests gains the site columns, and one march per site", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value)");
  sqlite.exec("INSERT INTO meta (key, value) VALUES ('terrain_seed', 42)");
  // The marches table as it was before rallies, heroes and harvests: the constructor adds the rest.
  sqlite.exec(
    "CREATE TABLE marches (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, npc_id TEXT NOT NULL, npc_level INTEGER NOT NULL, from_x INTEGER NOT NULL, from_y INTEGER NOT NULL, to_x INTEGER NOT NULL, to_y INTEGER NOT NULL, troops TEXT NOT NULL, seed INTEGER NOT NULL, depart_at INTEGER NOT NULL, arrive_at INTEGER NOT NULL, return_at INTEGER NOT NULL, phase TEXT NOT NULL)",
  );
  sqlite.exec("INSERT INTO marches VALUES ('old', 'acc', 'old-npc', 1, 0, 0, 1, 1, '{}', 1, 1, 2, 3, 'returning')");
  const sql: MapSql = { exec: (q, ...b) => sqlite.prepare(q).all(...b) as never };
  const { db, close } = sqliteDb();
  let n = 0;
  new MapService({ sql, db, random: seededRng(7), newId: () => `id-${++n}` });

  const columns = sql.exec<{ name: string }>("SELECT name FROM pragma_table_info('marches')").map((c) => c.name);
  expect(columns).toEqual(expect.arrayContaining(["site_id", "leave_site_at"]));
  expect(sql.exec("SELECT id FROM marches")).toEqual([{ id: "old" }]);
  sql.exec(
    "INSERT INTO marches (id, account_id, npc_id, npc_level, from_x, from_y, to_x, to_y, troops, seed, depart_at, arrive_at, return_at, phase, site_id) VALUES ('h1', 'a', 'x', 0, 0, 0, 1, 1, '{}', 0, 1, 2, 3, 'pending', 'farmland:0')",
  );
  expect(() =>
    sql.exec(
      "INSERT INTO marches (id, account_id, npc_id, npc_level, from_x, from_y, to_x, to_y, troops, seed, depart_at, arrive_at, return_at, phase, site_id) VALUES ('h2', 'b', 'x', 0, 0, 0, 1, 1, '{}', 0, 1, 2, 3, 'pending', 'farmland:0')",
    ),
  ).toThrow();
  close();
});

test("harvest: no base, roaming NPC, stronghold or HQ is ever placed on a resource site", () => {
  const sqlite = new DatabaseSync(":memory:");
  const sql: MapSql = { exec: (q, ...b) => sqlite.prepare(q).all(...b) as never };
  const { db, close } = sqliteDb();
  let n = 0;
  const service = new MapService({ sql, db, random: seededRng(3), newId: () => `id-${++n}` });
  const seed = Number(sql.exec<{ value: number }>("SELECT value FROM meta WHERE key = 'terrain_seed'")[0]!.value);
  const sites = placeSites(seed, geographyOf(seed, MAP_SIZE));
  expect(sites.length).toBeGreaterThan(0);
  for (let i = 0; i < 40; i++) service.ensureBase({ accountId: `acc-${i}`, handle: `h${i}`, allianceId: null, allianceTag: null }, T0);
  const placed = sql.exec<{ x: number; y: number }>("SELECT x, y FROM map_bases UNION ALL SELECT x, y FROM npcs UNION ALL SELECT x, y FROM alliance_hqs");
  expect(placed.length).toBeGreaterThan(40);
  expect(placed.some((p) => sites.some((s) => s.x === p.x && s.y === p.y))).toBe(false);
  const site = sites[0]!;
  expect(service.setHq({ accountId: "hq", handle: "H", allianceId: "al", allianceTag: "TAG" }, site.x, site.y, T0).value).toMatchObject({ ok: false, reason: "tile_taken" });
  close();
});
