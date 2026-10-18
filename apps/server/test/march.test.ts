import {
  advance,
  fightNpc,
  MAX_MARCHES,
  NPC_LEVELS,
  NPC_RESPAWN_MS,
  planMarch,
  START_TROOPS,
  ZERO_TROOPS,
  type BattleReport,
  type MapPoint,
} from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PENDING_TIMEOUT_MS } from "../src/map/map-service.ts";
import { MIN_ALARM_DELAY_MS } from "../src/map/map-host.ts";
import { body, HOUR, newGuest, startServer, T0, type Json, type Server } from "./harness.ts";
import { getMap, getState, intent, march, player } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer();
});
afterEach(() => server.dispose());

const reports = async (token: string): Promise<BattleReport[]> => (await body(await server.request("GET", "/v1/reports", { token }))).reports;

describe("march intent: validation", () => {
  test("sends troops from the base; timing comes from the server and the rules", async () => {
    const p = await player(server);
    const mine = p.snap.bases.find((b) => b.mine)!;
    const r = await march(server, p.token, p.npc.id, { infantry: 6 });
    expect(r.ok).toBe(true);
    expect(r.now).toBe(T0);
    expect(r.state.troops.infantry).toBe(START_TROOPS.infantry - 6);
    const timing = planMarch(mine, p.npc, { ...ZERO_TROOPS, infantry: 6 }, T0);
    expect(r.state.marches).toEqual([
      {
        id: expect.any(String),
        target: { npcId: p.npc.id, level: 1, x: p.npc.x, y: p.npc.y },
        from: { x: mine.x, y: mine.y },
        troops: { ...ZERO_TROOPS, infantry: 6 },
        ...timing,
        outcome: null,
      },
    ]);
    expect(await getState(server, p.token)).toEqual(r.state);
    const onMap = (await getMap(server, p.token)).marches;
    expect(onMap).toEqual([{ id: r.state.marches[0].id, mine: true, from: { x: mine.x, y: mine.y }, to: { x: p.npc.x, y: p.npc.y }, ...timing }]);
  });

  test("refuses more troops than are home, and changes nothing", async () => {
    const p = await player(server);
    const r = await march(server, p.token, p.npc.id, { infantry: START_TROOPS.infantry + 1 });
    expect(r).toMatchObject({ ok: false, reason: "not_enough_troops" });
    expect((await getState(server, p.token)).troops).toEqual(START_TROOPS);
    expect((await getMap(server, p.token)).marches).toEqual([]);
    expect(await march(server, p.token, p.npc.id, { heavy: 1 })).toMatchObject({ ok: false, reason: "not_enough_troops" });
  });

  test("refuses a march with no fighting troops", async () => {
    const p = await player(server);
    expect(await march(server, p.token, p.npc.id, {})).toMatchObject({ ok: false, reason: "no_troops" });
    expect(await march(server, p.token, p.npc.id, { porters: 0, infantry: 0 })).toMatchObject({ ok: false, reason: "no_troops" });
  });

  test(`refuses a march beyond ${MAX_MARCHES} at once`, async () => {
    const p = await player(server);
    for (let i = 0; i < MAX_MARCHES; i++) expect((await march(server, p.token, p.npc.id, { infantry: 1 })).ok).toBe(true);
    expect(await march(server, p.token, p.npc.id, { infantry: 1 })).toMatchObject({ ok: false, reason: "too_many_marches" });
  });

  test("an unknown or dead target is refused as gone", async () => {
    const p = await player(server);
    expect(await march(server, p.token, "no-such-npc", { infantry: 1 })).toMatchObject({ ok: false, reason: "target_gone" });
  });

  test("tampered intents are rejected with 400 and change nothing", async () => {
    const p = await player(server);
    const bad: unknown[] = [
      { type: "march", target: p.npc.id, troops: { infantry: -5 } },
      { type: "march", target: p.npc.id, troops: { infantry: 2.5 } },
      { type: "march", target: p.npc.id, troops: { infantry: "5" } },
      { type: "march", target: p.npc.id, troops: { cavalry: 5 } },
      { type: "march", target: p.npc.id, troops: { infantry: 1e9 } },
      { type: "march", target: p.npc.id, troops: [5] },
      { type: "march", target: p.npc.id },
      { type: "march", target: 42, troops: { infantry: 1 } },
      { type: "march", target: "x".repeat(65), troops: { infantry: 1 } },
      { type: "march", troops: { infantry: 1 } },
    ];
    for (const b of bad) expect((await intent(server, p.token, b)).status, JSON.stringify(b)).toBe(400);
    expect((await getState(server, p.token)).troops).toEqual(START_TROOPS);
    expect((await getMap(server, p.token)).marches).toEqual([]);
  });

  test("times, seeds, origins and outcomes sent by the client are ignored", async () => {
    const p = await player(server);
    const r = await body(
      await intent(server, p.token, {
        type: "march",
        target: p.npc.id,
        troops: { infantry: 4 },
        arriveAt: T0,
        returnAt: T0 + 1,
        seed: 1,
        from: { x: p.npc.x, y: p.npc.y },
        outcome: { result: "victory", loot: { food: 1e9 } },
      }),
    );
    const mine = p.snap.bases.find((b) => b.mine)!;
    expect(r.state.marches[0]).toMatchObject({ from: { x: mine.x, y: mine.y }, outcome: null, ...planMarch(mine, p.npc, { ...ZERO_TROOPS, infantry: 4 }, T0) });
  });

  test("an intent needs a valid token; one account cannot spend another's troops", async () => {
    const p = await player(server);
    expect((await server.request("POST", "/v1/intent", { body: { type: "march", target: p.npc.id, troops: { infantry: 1 } } })).status).toBe(401);
    const other = await newGuest(server);
    await march(server, other.token, p.npc.id, { infantry: 10 });
    expect((await getState(server, p.token)).troops).toEqual(START_TROOPS);
  });

  test("concurrent marches never spend the same troops twice", async () => {
    const p = await player(server);
    const results = await Promise.all([1, 2, 3].map(() => march(server, p.token, p.npc.id, { infantry: 6 })));
    expect(results.filter((r) => r.ok === true)).toHaveLength(1);
    const s = await getState(server, p.token);
    expect(s.troops.infantry).toBe(4);
    expect(s.marches).toHaveLength(1);
    expect((await getMap(server, p.token)).marches).toHaveLength(1);
  });
});

describe("march resolution by the map alarm", () => {
  const send = async (troops = { infantry: 10 }): Promise<{ p: Awaited<ReturnType<typeof player>>; m: Json }> => {
    const p = await player(server);
    const r = await march(server, p.token, p.npc.id, troops);
    if (!r.ok) throw new Error(r.reason);
    return { p, m: r.state.marches[0] };
  };

  test("the alarm is set for the arrival, and nothing happens before it", async () => {
    const { p, m } = await send();
    expect(server.map().alarmAt).toBe(m.arriveAt - T0);
    server.now = m.arriveAt - 1;
    await server.fireAlarm();
    expect((await getState(server, p.token)).marches[0].outcome).toBeNull();
    expect(await reports(p.token)).toEqual([]);
    expect(server.map().alarmAt).toBe(MIN_ALARM_DELAY_MS);
  });

  test("on arrival the battle is fought, the outcome lands on the base and a report is delivered", async () => {
    const { p, m } = await send();
    const res = await server.request("GET", "/v1/map/ws", { headers: { upgrade: "websocket", "sec-websocket-protocol": `revolt.v1, auth.${p.token}` } });
    expect(res.status).toBe(200);
    const socket = server.map().sockets[0]!;
    server.now = m.arriveAt;
    await server.fireAlarm();

    const [report] = await reports(p.token);
    if (report === undefined) throw new Error("no report");
    const expected = fightNpc({ ...ZERO_TROOPS, infantry: 10 }, 1, report.seed ?? -1);
    expect(report).toEqual({
      id: m.id,
      at: m.arriveAt,
      target: { kind: "patrol", level: 1, x: p.npc.x, y: p.npc.y },
      result: expected.outcome.result,
      sent: { ...ZERO_TROOPS, infantry: 10 },
      survivors: expected.outcome.survivors,
      wounded: expected.outcome.wounded,
      lost: expected.outcome.lost,
      defenders: NPC_LEVELS[0]!.defenders,
      defendersKilled: expected.battle?.defenderKilled,
      rounds: expected.battle?.rounds.length,
      loot: expected.outcome.loot,
      seed: report.seed,
    });
    expect((await getState(server, p.token)).marches[0].outcome).toEqual(expected.outcome);
    const types = socket.received.map((x: Json) => x.type);
    expect(types).toContain("report");
    expect(types).toContain("base_changed");
    expect(socket.received.find((x: Json) => x.type === "report").report).toEqual(report);
    // The alarm moves on to the return.
    expect(server.map().alarmAt).toBe(m.returnAt - m.arriveAt);
  });

  test("a defeated target leaves the map and respawns elsewhere, under a new id, later", async () => {
    const { p, m } = await send();
    server.now = m.arriveAt;
    await server.fireAlarm();
    const [report] = await reports(p.token);
    expect(report?.result).toBe("victory");
    const after = await getMap(server, p.token);
    expect(after.npcs.some((n) => n.id === p.npc.id)).toBe(false);
    expect(after.npcs.filter((n) => n.level === 1)).toHaveLength(p.snap.npcs.filter((n) => n.level === 1).length - 1);
    server.now = m.arriveAt + NPC_RESPAWN_MS;
    await server.fireAlarm();
    const respawned = await getMap(server, p.token);
    expect(respawned.npcs.filter((n) => n.level === 1)).toHaveLength(p.snap.npcs.filter((n) => n.level === 1).length);
    expect(respawned.npcs.some((n) => n.id === p.npc.id)).toBe(false);
  });

  test("the troops and loot come home at returnAt; the march leaves the map", async () => {
    const { p, m } = await send();
    server.now = m.arriveAt;
    await server.fireAlarm();
    const outcome = (await getState(server, p.token)).marches[0].outcome;
    server.now = m.returnAt - 1;
    expect((await getState(server, p.token)).troops.infantry).toBe(0);
    server.now = m.returnAt;
    await server.fireAlarm();
    const home = await getState(server, p.token);
    expect(home.marches).toEqual([]);
    expect(home.troops.infantry).toBe(outcome.survivors.infantry);
    expect(home.wounded.infantry).toBe(outcome.wounded.infantry);
    expect((await getMap(server, p.token)).marches).toEqual([]);
    expect(server.map().alarmAt).toBe(NPC_RESPAWN_MS - (m.returnAt - m.arriveAt));
  });

  test("without an alarm, the next request settles what is due (lazy resolution)", async () => {
    const { p, m } = await send();
    server.now = m.returnAt + HOUR;
    const snap = await getMap(server, p.token);
    expect(snap.marches).toEqual([]);
    expect(await reports(p.token)).toHaveLength(1);
    expect((await getState(server, p.token)).marches).toEqual([]);
  });

  test("a second march on the same target finds it gone and comes home untouched", async () => {
    const p = await player(server);
    const first = await march(server, p.token, p.npc.id, { infantry: 9 });
    server.now = T0 + 1000;
    const second = await march(server, p.token, p.npc.id, { infantry: 1 });
    expect(first.ok && second.ok).toBe(true);
    server.now = second.state.marches[1].arriveAt;
    await server.fireAlarm();
    const rs = await reports(p.token);
    expect(rs.map((r) => r.result)).toEqual(["target_gone", "victory"]);
    expect(rs[0]).toMatchObject({ survivors: { ...ZERO_TROOPS, infantry: 1 }, rounds: 0, seed: null });
  });

  test("resolving again (alarm retry) changes nothing", async () => {
    const { p, m } = await send();
    server.now = m.arriveAt;
    await server.fireAlarm();
    const state = await getState(server, p.token);
    // Pretend the map crashed after writing D1 but before moving on: replay the arrival.
    server.map().sql.exec("UPDATE marches SET phase = 'outbound' WHERE id = ?", m.id);
    server.map().sql.exec("UPDATE npcs SET respawn_at = NULL WHERE id = ?", m.target.npcId);
    await server.fireAlarm();
    expect(await getState(server, p.token)).toEqual(state);
    expect(await reports(p.token)).toHaveLength(1);
  });

  test("a march the map lost comes home unharmed after the grace period", async () => {
    const { p, m } = await send();
    server.map().sql.exec("DELETE FROM marches WHERE id = ?", m.id);
    server.now = m.returnAt + HOUR;
    const s = await getState(server, p.token);
    expect(s.marches).toEqual([]);
    expect(s.troops.infantry).toBe(10);
  });

  test("a pending march whose base write never happened is dropped", async () => {
    const p = await player(server);
    server.map().sql.exec(
      `INSERT INTO marches (id, account_id, npc_id, npc_level, from_x, from_y, to_x, to_y, troops, seed, depart_at, arrive_at, return_at, phase)
       VALUES ('ghost', ?, ?, 1, 0, 0, 1, 1, '{}', 1, ?, ?, ?, 'pending')`,
      p.res.account.id, p.npc.id, T0, T0 + 1000, T0 + 2000,
    );
    server.now = T0 + PENDING_TIMEOUT_MS;
    await server.fireAlarm();
    expect(server.map().sql.exec("SELECT id FROM marches WHERE id = 'ghost'")).toEqual([]);
  });
});

describe("determinism", () => {
  /** Plays the same script on a fresh server with a given map seed; returns the battle report. */
  const play = async (mapSeed: number): Promise<{ report: BattleReport; npc: MapPoint }> => {
    const s = await startServer();
    s.mapSeed = mapSeed;
    try {
      const g = await newGuest(s);
      const snap: Json = await body(await s.request("GET", "/v1/map", { token: g.token }));
      const npc = snap.npcs.find((n: Json) => n.level === 2);
      const r = await body(await s.request("POST", "/v1/intent", { token: g.token, body: { type: "march", target: npc.id, troops: { infantry: 10 } } }));
      s.now = r.state.marches[0].arriveAt;
      await s.fireAlarm();
      const [report] = (await body(await s.request("GET", "/v1/reports", { token: g.token }))).reports;
      return { report: { ...report, id: "" }, npc };
    } finally {
      await s.dispose();
    }
  };

  test("the same seed gives the same battle; the report replays from its seed", async () => {
    const a = await play(7);
    const b = await play(7);
    expect(b).toEqual(a);
    const replay = fightNpc(a.report.sent, a.report.target.level, a.report.seed ?? -1);
    expect(replay.outcome).toMatchObject({ survivors: a.report.survivors, wounded: a.report.wounded, lost: a.report.lost, loot: a.report.loot });
  });
});

describe("train intent", () => {
  test("trains at server time and completes lazily", async () => {
    const g = await newGuest(server);
    const r = await body(await intent(server, g.token, { type: "train", troop: "scouts", count: 5, endsAt: T0 }));
    expect(r).toMatchObject({ ok: true, now: T0, state: { training: { troop: "scouts", count: 5, startedAt: T0 } } });
    server.now = r.state.training.endsAt;
    expect((await getState(server, g.token)).troops.scouts).toBe(5);
    expect(advance(r.state, r.state.training.endsAt).troops.scouts).toBe(5);
  });

  test("rule refusals are answers; malformed intents are 400", async () => {
    const g = await newGuest(server);
    expect(await body(await intent(server, g.token, { type: "train", troop: "heavy", count: 1000 }))).toMatchObject({ ok: false, reason: "bad_count" });
    expect(await body(await intent(server, g.token, { type: "train", troop: "heavy", count: 20 }))).toMatchObject({ ok: false, reason: "insufficient" });
    for (const b of [{ type: "train", troop: "cavalry", count: 1 }, { type: "train", troop: "heavy", count: "1" }, { type: "train", troop: "heavy" }]) {
      expect((await intent(server, g.token, b)).status).toBe(400);
    }
  });
});
