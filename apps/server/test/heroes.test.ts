import { fightNpc, heroMods, HEROES, HERO_LEVEL_UP, NPC_SHARD_DROP, START_TROOPS, type BattleReport } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { body, HOUR, newGuest, startServer, type Json, type Server } from "./harness.ts";
import { editBase, getMap, getState, heroIntent, intent, march, player } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer();
});
afterEach(() => server.dispose());

const idOf = (p: { res: Json }): string => p.res.account.id as string;

/** A guest with shards and support for the first hero, written straight to the base row. */
const stocked = async (): Promise<Awaited<ReturnType<typeof player>>> => {
  const p = await player(server);
  await editBase(server, idOf(p), (s) => {
    s.heroes.courier.shards = 60;
    s.heroes.medic.shards = 10;
    s.resources.support = 200;
  });
  return p;
};

const reports = async (token: string): Promise<BattleReport[]> => (await body(await server.request("GET", "/v1/reports", { token }))).reports;

describe("hero_recruit and hero_level intents", () => {
  test("recruit spends the shards and support the server's tables say, and the state round-trips", async () => {
    const p = await stocked();
    const r = await heroIntent(server, p.token, "hero_recruit", "courier");
    expect(r.ok).toBe(true);
    expect(r.state.heroes.courier).toEqual({ level: 1, shards: 60 - HEROES.courier.recruitShards });
    expect(r.state.resources.support).toBeCloseTo(200 - HEROES.courier.recruitSupport, 0);
    expect(await getState(server, p.token)).toEqual(r.state);
  });

  test("level up spends shards and resources, one level at a time, up to the hall cap", async () => {
    const p = await stocked();
    await heroIntent(server, p.token, "hero_recruit", "courier");
    const up = await heroIntent(server, p.token, "hero_level", "courier");
    expect(up.ok).toBe(true);
    expect(up.state.heroes.courier).toEqual({ level: 2, shards: 60 - HEROES.courier.recruitShards - HERO_LEVEL_UP[0]!.shards });
    // The hero hall is level 1, so level 2 is the cap.
    expect(await heroIntent(server, p.token, "hero_level", "courier")).toMatchObject({ ok: false, reason: "hall_level" });
  });

  test("every refusal comes back as a normal answer with the reason and the current state", async () => {
    const p = await player(server);
    expect(await heroIntent(server, p.token, "hero_recruit", "courier")).toMatchObject({ ok: false, reason: "not_enough_shards" });
    expect(await heroIntent(server, p.token, "hero_level", "courier")).toMatchObject({ ok: false, reason: "not_recruited" });
    await editBase(server, idOf(p), (s) => (s.heroes.courier.shards = 99));
    expect(await heroIntent(server, p.token, "hero_recruit", "courier")).toMatchObject({ ok: false, reason: "insufficient" });
    await editBase(server, idOf(p), (s) => (s.resources.support = 100));
    expect((await heroIntent(server, p.token, "hero_recruit", "courier")).ok).toBe(true);
    expect(await heroIntent(server, p.token, "hero_recruit", "courier")).toMatchObject({ ok: false, reason: "already_recruited" });
  });

  test("numbers sent by the client are never read", async () => {
    const p = await stocked();
    const r = await heroIntent(server, p.token, "hero_recruit", "courier", { level: 10, shards: 9999, cost: 0, recruitShards: 0, support: 1e9 });
    expect(r.state.heroes.courier).toEqual({ level: 1, shards: 60 - HEROES.courier.recruitShards });
    const lv = await heroIntent(server, p.token, "hero_level", "courier", { level: 10, cost: { shards: 0 } });
    expect(lv.state.heroes.courier.level).toBe(2);
  });

  test("a client cannot give itself heroes by importing a save", async () => {
    const forged = (await newGuest(server)).res.state;
    forged.heroes.courier = { level: 10, shards: 999_999 };
    forged.story = { chapter: 3, victories: 99 };
    const g = await newGuest(server, forged);
    expect(g.res.state.heroes.courier).toEqual({ level: 0, shards: 0 });
    expect(g.res.state.story).toEqual({ chapter: 0, victories: 0 });
  });

  test("malformed intents are rejected with 400 and change nothing", async () => {
    const p = await stocked();
    const before = await getState(server, p.token);
    const bad: unknown[] = [
      { type: "hero_recruit" },
      { type: "hero_recruit", hero: "nobody" },
      { type: "hero_recruit", hero: 5 },
      { type: "hero_recruit", hero: ["courier"] },
      { type: "hero_level", hero: null },
      { type: "hero_level", hero: "x".repeat(1000) },
      { type: "hero_level", hero: { id: "courier" } },
    ];
    for (const b of bad) expect((await intent(server, p.token, b)).status, JSON.stringify(b)).toBe(400);
    expect(await getState(server, p.token)).toEqual(before);
  });

  test("concurrent recruits spend once", async () => {
    const p = await stocked();
    const rs = await Promise.all([1, 2, 3].map(() => heroIntent(server, p.token, "hero_recruit", "courier")));
    expect(rs.filter((r) => r.ok === true)).toHaveLength(1);
    expect(rs.filter((r) => r.ok === false).every((r) => r.reason === "already_recruited")).toBe(true);
    expect((await getState(server, p.token)).heroes.courier.shards).toBe(60 - HEROES.courier.recruitShards);
  });

  test("an intent needs a token, and one account's heroes are not another's", async () => {
    const p = await stocked();
    expect((await server.request("POST", "/v1/intent", { body: { type: "hero_recruit", hero: "courier" } })).status).toBe(401);
    const other = await newGuest(server);
    await heroIntent(server, p.token, "hero_recruit", "courier");
    expect((await getState(server, other.token)).heroes.courier.level).toBe(0);
  });

  test("old stored bases without heroes load with defaults", async () => {
    const p = await player(server);
    await editBase(server, idOf(p), (s) => {
      delete s.heroes;
      delete s.story;
      delete s.levels.hero_hall;
    });
    const s = await getState(server, p.token);
    expect(s.levels.hero_hall).toBe(1);
    expect(s.heroes.courier).toEqual({ level: 0, shards: 0 });
    expect(s.story).toEqual({ chapter: 0, victories: 0 });
  });
});

describe("marching with heroes", () => {
  const armed = async (): Promise<Awaited<ReturnType<typeof player>>> => {
    const p = await player(server);
    await getMap(server, p.token);
    await editBase(server, idOf(p), (s) => {
      s.troops.infantry = 40;
      s.heroes.courier = { level: 3, shards: 0 };
      s.heroes.medic = { level: 1, shards: 0 };
    });
    return p;
  };

  test("the squad is frozen on the march, the map row and the base agree", async () => {
    const p = await armed();
    const r = await march(server, p.token, p.npc.id, { infantry: 12 }, ["courier", "medic"]);
    expect(r.ok).toBe(true);
    const squad = [
      { id: "courier", level: 3 },
      { id: "medic", level: 1 },
    ];
    expect(r.state.marches[0].heroes).toEqual(squad);
    const row = server.map().sql.exec<{ heroes: string }>("SELECT heroes FROM marches WHERE id = ?", r.state.marches[0].id)[0];
    expect(JSON.parse(row!.heroes)).toEqual(squad);
  });

  test("a march without heroes stores none", async () => {
    const p = await armed();
    const r = await march(server, p.token, p.npc.id, { infantry: 12 });
    expect(r.state.marches[0]).not.toHaveProperty("heroes");
    expect(server.map().sql.exec<{ heroes: string | null }>("SELECT heroes FROM marches")[0]?.heroes).toBeNull();
  });

  test("refuses heroes not owned, duplicates and too many, as normal answers or 400", async () => {
    const p = await armed();
    expect(await march(server, p.token, p.npc.id, { infantry: 5 }, ["mountain_guide"])).toMatchObject({ ok: false, reason: "hero_not_owned" });
    expect(await march(server, p.token, p.npc.id, { infantry: 5 }, ["courier", "courier"])).toMatchObject({ ok: false, reason: "bad_squad" });
    for (const heroes of [["courier", "medic", "organizer", "quartermaster"], ["nobody"], "courier", [1], [null]]) {
      expect((await intent(server, p.token, { type: "march", target: p.npc.id, troops: { infantry: 5 }, heroes })).status, JSON.stringify(heroes)).toBe(400);
    }
    expect((await getState(server, p.token)).marches).toEqual([]);
  });

  test("a hero out on a march is busy, even for two marches racing for the same hero", async () => {
    const p = await armed();
    const rs = await Promise.all([1, 2].map(() => march(server, p.token, p.npc.id, { infantry: 5 }, ["courier"])));
    expect(rs.filter((r) => r.ok === true)).toHaveLength(1);
    expect(rs.find((r) => r.ok === false)).toMatchObject({ reason: "hero_busy" });
    expect(await march(server, p.token, p.npc.id, { infantry: 5 }, ["courier", "medic"])).toMatchObject({ ok: false, reason: "hero_busy" });
    expect((await march(server, p.token, p.npc.id, { infantry: 5 }, ["medic"])).ok).toBe(true);
    expect(server.map().sql.exec("SELECT 1 FROM marches")).toHaveLength(2);
  });

  test("the battle uses the frozen squad: the report matches a replay with the same mods", async () => {
    const p = await armed();
    const r = await march(server, p.token, p.npc.id, { infantry: 12 }, ["courier", "medic"]);
    const m = r.state.marches[0];
    server.now = m.arriveAt;
    await server.fireAlarm();
    const [report] = await reports(p.token);
    if (report === undefined) throw new Error("no report");
    const squad = [
      { id: "courier", level: 3 },
      { id: "medic", level: 1 },
    ] as const;
    const expected = fightNpc({ ...START_TROOPS, infantry: 12 }, 1, report.seed ?? -1, heroMods(squad));
    expect(report.heroes).toEqual(squad);
    expect(report.survivors).toEqual(expected.outcome.survivors);
    expect(report.wounded).toEqual(expected.outcome.wounded);
    expect(report.lost).toEqual(expected.outcome.lost);
    expect(report.loot).toEqual(expected.outcome.loot);
    expect(report.result).toBe(expected.outcome.result);
  });

  test("a level-up while the hero is out does not change the battle", async () => {
    const p = await armed();
    await editBase(server, idOf(p), (s) => {
      s.heroes.courier.shards = 50;
      s.levels.hero_hall = 5;
      s.resources = { food: 3000, materiel: 3000, funds: 3000, support: 0 };
    });
    const r = await march(server, p.token, p.npc.id, { infantry: 12 }, ["courier"]);
    const up = await heroIntent(server, p.token, "hero_level", "courier");
    expect(up.ok).toBe(true);
    expect(up.state.heroes.courier.level).toBe(4);
    expect(up.state.marches[0].heroes).toEqual([{ id: "courier", level: 3 }]);
    server.now = r.state.marches[0].arriveAt;
    await server.fireAlarm();
    const [report] = await reports(p.token);
    expect(report?.heroes).toEqual([{ id: "courier", level: 3 }]);
    const expected = fightNpc({ ...START_TROOPS, infantry: 12 }, 1, report?.seed ?? -1, heroMods([{ id: "courier", level: 3 }]));
    expect(report?.survivors).toEqual(expected.outcome.survivors);
  });

  test("on return a victory pays shards to the lead hero and counts for the story, once; the hero is free again", async () => {
    const p = await armed();
    const r = await march(server, p.token, p.npc.id, { infantry: 30 }, ["courier", "medic"]);
    const m = r.state.marches[0];
    server.now = m.arriveAt;
    await server.fireAlarm();
    const [report] = await reports(p.token);
    expect(report?.result).toBe("victory");
    const another = p.snap.npcs.find((n) => n.level === 1 && n.id !== p.npc.id)!;
    // Out, resolved, but not home yet: nothing paid.
    let s = await getState(server, p.token);
    expect(s.heroes.courier.shards).toBe(0);
    expect(await march(server, p.token, another.id, { infantry: 1 }, ["courier"])).toMatchObject({ ok: false, reason: "hero_busy" });
    server.now = m.returnAt;
    await server.fireAlarm();
    s = await getState(server, p.token);
    expect(s.marches).toEqual([]);
    expect(s.heroes.courier.shards).toBe(NPC_SHARD_DROP[0]);
    expect(s.heroes.medic.shards).toBe(0);
    expect(s.story.victories).toBe(1);
    server.now = m.returnAt + 5 * HOUR;
    s = await getState(server, p.token);
    expect(s.heroes.courier.shards).toBe(NPC_SHARD_DROP[0]);
    expect(s.story.victories).toBe(1);
    expect((await march(server, p.token, another.id, { infantry: 1 }, ["courier"])).ok).toBe(true);
  });

  test("a map that predates heroes gets the column added and keeps its marches", async () => {
    const p = await armed();
    const r = await march(server, p.token, p.npc.id, { infantry: 12 });
    // Simulate an old row: no heroes recorded.
    server.map().sql.exec("UPDATE marches SET heroes = NULL");
    server.now = r.state.marches[0].arriveAt;
    await server.fireAlarm();
    expect((await reports(p.token))[0]?.heroes).toBeUndefined();
  });
});
