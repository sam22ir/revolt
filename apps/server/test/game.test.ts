import {
  advance,
  createBaseState,
  fightNpc,
  MAX_MARCHES,
  NO_WORLD,
  NPC_LEVELS,
  NPC_RESPAWN_MS,
  planMarch,
  startUpgrade,
  START_TROOPS,
  ZERO_TROOPS,
  type BattleReport,
  type MapPoint,
} from "@revolt/rules";
import { expect, test } from "vitest";
import { MIN_ALARM_DELAY_MS } from "../src/map/map-host.ts";
import { PENDING_TIMEOUT_MS } from "../src/map/map-service.ts";
import { body, HOUR, newGuest, startServer, T0, type Json, type Server } from "./harness.ts";
import { getMap, getState, intent, march, player } from "./map-helpers.ts";
import { LONG, rows } from "./rows.ts";

const reports = async (s: Server, token: string): Promise<BattleReport[]> => (await body(await s.request("GET", "/v1/reports", { token }))).reports;

test("upgrade intent: server time, refusals, races, tampered requests", async () => {
  const upgraded = (at: number): Json => {
    const expected = startUpgrade(createBaseState(T0), "hq", at, NO_WORLD);
    if (!expected.ok) throw new Error(expected.reason);
    return expected.state;
  };
  await rows({}, {
    "is validated with the shared rules at server time and saved": async (s, ex) => {
      const d = await newGuest(s);
      s.now = T0 + HOUR;
      const b = await body(await intent(s, d.token, { type: "upgrade", building: "hq" }));
      ex(b).toEqual({ ok: true, state: upgraded(T0 + HOUR), liberations: [], now: T0 + HOUR });
      ex(await getState(s, d.token)).toEqual(upgraded(T0 + HOUR));
    },
    "a rule rejection returns the reason and changes nothing": async (s, ex) => {
      const d = await newGuest(s);
      const b = await body(await intent(s, d.token, { type: "upgrade", building: "farm" }));
      ex(b.ok).toBe(false);
      ex(b.reason).toBe("hq_gate");
      ex(await getState(s, d.token)).toEqual(createBaseState(T0));
    },
    "a second upgrade while one runs is refused": async (s, ex) => {
      const d = await newGuest(s);
      await intent(s, d.token, { type: "upgrade", building: "hq" });
      ex(await body(await intent(s, d.token, { type: "upgrade", building: "hq" }))).toMatchObject({ ok: false, reason: "queue_busy" });
    },
    "concurrent intents never both succeed": async (s, ex) => {
      const d = await newGuest(s);
      const results = await Promise.all([1, 2, 3].map(() => intent(s, d.token, { type: "upgrade", building: "hq" }).then(body)));
      ex(results.filter((r) => r.ok === true)).toHaveLength(1);
      ex(await getState(s, d.token)).toEqual(upgraded(T0));
    },
  });
}, LONG);

test("upgrade intent: tampered requests", async () => {
  const rich = { food: 1e9, materiel: 1e9, funds: 1e9, support: 1e9 };
  const upgraded = (at: number): Json => {
    const expected = startUpgrade(createBaseState(T0), "hq", at, NO_WORLD);
    if (!expected.ok) throw new Error(expected.reason);
    return expected.state;
  };
  await rows({}, {
    "numbers sent by the client are ignored": async (s, ex) => {
      const d = await newGuest(s);
      const b = await body(
        await intent(s, d.token, {
          type: "upgrade",
          building: "hq",
          state: { ...createBaseState(T0), resources: rich, levels: { hq: 10, farm: 10, armory: 10, treasury: 10 } },
          resources: rich,
          cost: { food: 0, materiel: 0, funds: 0, support: 0 },
          durationMs: 1,
          now: T0 + 100 * HOUR,
        }),
      );
      ex(b.state).toEqual(upgraded(T0));
    },
    "an upgrade the base cannot pay for is refused even if the client claims to be rich": async (s, ex) => {
      const d = await newGuest(s);
      await intent(s, d.token, { type: "upgrade", building: "hq" });
      s.now = T0 + 61_000; // HQ 2 done; HQ 3 costs more than is left.
      const b = await body(await intent(s, d.token, { type: "upgrade", building: "hq", resources: rich, state: { resources: rich } }));
      ex(b).toMatchObject({ ok: false, reason: "insufficient" });
      ex(b.state.levels.hq).toBe(2);
      ex(b.state.resources.food).toBeLessThan(500);
    },
    "malformed intents are rejected with 400 and change nothing": async (s, ex) => {
      const d = await newGuest(s);
      const bad: unknown[] = [
        { type: "setResources", food: 1e9 },
        { type: "upgrade", building: "castle" },
        { type: "upgrade" },
        { type: "upgrade", building: ["hq"] },
        { type: "upgrade", building: "__proto__" },
      ];
      for (const b of bad) ex((await intent(s, d.token, b)).status, JSON.stringify(b)).toBe(400);
      ex((await s.request("POST", "/v1/intent", { token: d.token, raw: "{not json" })).status, "not json").toBe(400);
      ex((await s.request("POST", "/v1/intent", { token: d.token, raw: "[1,2]" })).status, "array").toBe(400);
      ex((await s.request("POST", "/v1/intent", { token: d.token, raw: "x".repeat(20_000) })).status, "too large").toBe(413);
      ex(await getState(s, d.token)).toEqual(createBaseState(T0));
    },
    "an intent without a valid token is rejected": async (s, ex) => {
      const d = await newGuest(s);
      ex((await s.request("POST", "/v1/intent", { body: { type: "upgrade", building: "hq" } })).status, "no token").toBe(401);
      ex((await intent(s, "y".repeat(43), { type: "upgrade", building: "hq" })).status, "unknown token").toBe(401);
      ex(await getState(s, d.token)).toEqual(createBaseState(T0));
    },
    "one account's token cannot touch another account's base": async (s, ex) => {
      const d = await newGuest(s);
      const other = await newGuest(s);
      await intent(s, other.token, { type: "upgrade", building: "hq" });
      ex(await getState(s, d.token)).toEqual(createBaseState(T0));
    },
  });
}, LONG);

test("train intent: server time, lazy completion, refusals", async () => {
  await rows({}, {
    "trains at server time and completes lazily": async (s, ex) => {
      const g = await newGuest(s);
      const r = await body(await intent(s, g.token, { type: "train", troop: "scouts", count: 5, endsAt: T0 }));
      ex(r).toMatchObject({ ok: true, now: T0, state: { training: { troop: "scouts", count: 5, startedAt: T0 } } });
      s.now = r.state.training.endsAt;
      ex((await getState(s, g.token)).troops.scouts).toBe(5);
      ex(advance(r.state, r.state.training.endsAt, NO_WORLD).troops.scouts, "rules agree").toBe(5);
    },
    "rule refusals are answers; malformed intents are 400": async (s, ex) => {
      const g = await newGuest(s);
      ex(await body(await intent(s, g.token, { type: "train", troop: "heavy", count: 1000 })), "too many").toMatchObject({ ok: false, reason: "bad_count" });
      ex(await body(await intent(s, g.token, { type: "train", troop: "heavy", count: 20 })), "cannot pay").toMatchObject({ ok: false, reason: "insufficient" });
      for (const b of [{ type: "train", troop: "cavalry", count: 1 }, { type: "train", troop: "heavy", count: "1" }, { type: "train", troop: "heavy" }]) {
        ex((await intent(s, g.token, b)).status, JSON.stringify(b)).toBe(400);
      }
    },
  });
}, LONG);

test("march intent: timing, refusals, tampering, concurrency", async () => {
  await rows({}, {
    "sends troops from the base; timing comes from the server and the rules": async (s, ex) => {
      const p = await player(s);
      const mine = p.snap.bases.find((b) => b.mine)!;
      const r = await march(s, p.token, p.npc.id, { infantry: 6 });
      ex(r.ok).toBe(true);
      ex(r.now).toBe(T0);
      ex(r.state.troops.infantry).toBe(START_TROOPS.infantry - 6);
      const timing = planMarch(mine, p.npc, { ...ZERO_TROOPS, infantry: 6 }, T0);
      ex(r.state.marches).toEqual([
        {
          id: expect.any(String),
          target: { npcId: p.npc.id, level: 1, x: p.npc.x, y: p.npc.y },
          from: { x: mine.x, y: mine.y },
          troops: { ...ZERO_TROOPS, infantry: 6 },
          ...timing,
          outcome: null,
        },
      ]);
      ex(await getState(s, p.token)).toEqual(r.state);
      const onMap = (await getMap(s, p.token)).marches;
      ex(onMap).toEqual([{ id: r.state.marches[0].id, mine: true, from: { x: mine.x, y: mine.y }, to: { x: p.npc.x, y: p.npc.y }, ...timing }]);
    },
    "refuses more troops than are home, and changes nothing": async (s, ex) => {
      const p = await player(s);
      const r = await march(s, p.token, p.npc.id, { infantry: START_TROOPS.infantry + 1 });
      ex(r).toMatchObject({ ok: false, reason: "not_enough_troops" });
      ex((await getState(s, p.token)).troops).toEqual(START_TROOPS);
      ex((await getMap(s, p.token)).marches).toEqual([]);
      ex(await march(s, p.token, p.npc.id, { heavy: 1 }), "troops it does not have").toMatchObject({ ok: false, reason: "not_enough_troops" });
    },
    "refuses a march with no fighting troops": async (s, ex) => {
      const p = await player(s);
      ex(await march(s, p.token, p.npc.id, {}), "empty").toMatchObject({ ok: false, reason: "no_troops" });
      ex(await march(s, p.token, p.npc.id, { porters: 0, infantry: 0 }), "zeros").toMatchObject({ ok: false, reason: "no_troops" });
    },
    [`refuses a march beyond ${MAX_MARCHES} at once`]: async (s, ex) => {
      const p = await player(s);
      for (let i = 0; i < MAX_MARCHES; i++) ex((await march(s, p.token, p.npc.id, { infantry: 1 })).ok, `march ${i}`).toBe(true);
      ex(await march(s, p.token, p.npc.id, { infantry: 1 })).toMatchObject({ ok: false, reason: "too_many_marches" });
    },
    "an unknown or dead target is refused as gone": async (s, ex) => {
      const p = await player(s);
      ex(await march(s, p.token, "no-such-npc", { infantry: 1 })).toMatchObject({ ok: false, reason: "target_gone" });
    },
    "tampered intents are rejected with 400 and change nothing": async (s, ex) => {
      const p = await player(s);
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
      for (const b of bad) ex((await intent(s, p.token, b)).status, JSON.stringify(b)).toBe(400);
      ex((await getState(s, p.token)).troops).toEqual(START_TROOPS);
      ex((await getMap(s, p.token)).marches).toEqual([]);
    },
    "times, seeds, origins and outcomes sent by the client are ignored": async (s, ex) => {
      const p = await player(s);
      const r = await body(
        await intent(s, p.token, {
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
      ex(r.state.marches[0]).toMatchObject({ from: { x: mine.x, y: mine.y }, outcome: null, ...planMarch(mine, p.npc, { ...ZERO_TROOPS, infantry: 4 }, T0) });
    },
    "an intent needs a valid token; one account cannot spend another's troops": async (s, ex) => {
      const p = await player(s);
      ex((await s.request("POST", "/v1/intent", { body: { type: "march", target: p.npc.id, troops: { infantry: 1 } } })).status).toBe(401);
      const other = await newGuest(s);
      await march(s, other.token, p.npc.id, { infantry: 10 });
      ex((await getState(s, p.token)).troops).toEqual(START_TROOPS);
    },
    "concurrent marches never spend the same troops twice": async (s, ex) => {
      const p = await player(s);
      const results = await Promise.all([1, 2, 3].map(() => march(s, p.token, p.npc.id, { infantry: 6 })));
      ex(results.filter((r) => r.ok === true)).toHaveLength(1);
      const st = await getState(s, p.token);
      ex(st.troops.infantry).toBe(4);
      ex(st.marches).toHaveLength(1);
      ex((await getMap(s, p.token)).marches).toHaveLength(1);
    },
  });
}, LONG);

test("march resolution by the map alarm: arrival, battle, respawn, return, lazy, retries, lost marches", async () => {
  const send = async (s: Server, troops = { infantry: 10 }): Promise<{ p: Awaited<ReturnType<typeof player>>; m: Json }> => {
    const p = await player(s);
    const r = await march(s, p.token, p.npc.id, troops);
    if (!r.ok) throw new Error(r.reason);
    return { p, m: r.state.marches[0] };
  };
  await rows({}, {
    "the alarm is set for the arrival, and nothing happens before it": async (s, ex) => {
      const { p, m } = await send(s);
      ex(s.map().alarmAt).toBe(m.arriveAt - T0);
      s.now = m.arriveAt - 1;
      await s.fireAlarm();
      ex((await getState(s, p.token)).marches[0].outcome).toBeNull();
      ex(await reports(s, p.token)).toEqual([]);
      ex(s.map().alarmAt, "alarm re-armed at the minimum delay").toBe(MIN_ALARM_DELAY_MS);
    },
    "on arrival the battle is fought, the outcome lands on the base and a report is delivered": async (s, ex) => {
      const { p, m } = await send(s);
      const res = await s.request("GET", "/v1/map/ws", { headers: { upgrade: "websocket", "sec-websocket-protocol": `revolt.v1, auth.${p.token}` } });
      ex(res.status).toBe(200);
      const socket = s.map().sockets[0]!;
      s.now = m.arriveAt;
      await s.fireAlarm();

      const [report] = await reports(s, p.token);
      if (report === undefined) throw new Error("no report");
      const expected = fightNpc({ ...ZERO_TROOPS, infantry: 10 }, 1, report.seed ?? -1);
      ex(report).toEqual({
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
      ex((await getState(s, p.token)).marches[0].outcome).toEqual(expected.outcome);
      const types = socket.received.map((x: Json) => x.type);
      ex(types).toContain("report");
      ex(types).toContain("base_changed");
      ex(socket.received.find((x: Json) => x.type === "report").report).toEqual(report);
      ex(s.map().alarmAt, "the alarm moves on to the return").toBe(m.returnAt - m.arriveAt);
    },
    "a defeated target leaves the map and respawns elsewhere, under a new id, later": async (s, ex) => {
      const { p, m } = await send(s);
      s.now = m.arriveAt;
      await s.fireAlarm();
      const [report] = await reports(s, p.token);
      ex(report?.result).toBe("victory");
      const after = await getMap(s, p.token);
      ex(after.npcs.some((n) => n.id === p.npc.id)).toBe(false);
      ex(after.npcs.filter((n) => n.level === 1)).toHaveLength(p.snap.npcs.filter((n) => n.level === 1).length - 1);
      s.now = m.arriveAt + NPC_RESPAWN_MS;
      await s.fireAlarm();
      const respawned = await getMap(s, p.token);
      ex(respawned.npcs.filter((n) => n.level === 1), "respawned count").toHaveLength(p.snap.npcs.filter((n) => n.level === 1).length);
      ex(respawned.npcs.some((n) => n.id === p.npc.id), "new id").toBe(false);
    },
    "the troops and loot come home at returnAt; the march leaves the map": async (s, ex) => {
      const { p, m } = await send(s);
      s.now = m.arriveAt;
      await s.fireAlarm();
      const outcome = (await getState(s, p.token)).marches[0].outcome;
      s.now = m.returnAt - 1;
      ex((await getState(s, p.token)).troops.infantry, "before return").toBe(0);
      s.now = m.returnAt;
      await s.fireAlarm();
      const home = await getState(s, p.token);
      ex(home.marches).toEqual([]);
      ex(home.troops.infantry).toBe(outcome.survivors.infantry);
      ex(home.wounded.infantry).toBe(outcome.wounded.infantry);
      ex((await getMap(s, p.token)).marches).toEqual([]);
      ex(s.map().alarmAt).toBe(NPC_RESPAWN_MS - (m.returnAt - m.arriveAt));
    },
    "without an alarm, the next request settles what is due (lazy resolution)": async (s, ex) => {
      const { p, m } = await send(s);
      s.now = m.returnAt + HOUR;
      const snap = await getMap(s, p.token);
      ex(snap.marches).toEqual([]);
      ex(await reports(s, p.token)).toHaveLength(1);
      ex((await getState(s, p.token)).marches).toEqual([]);
    },
    "a second march on the same target finds it gone and comes home untouched": async (s, ex) => {
      const p = await player(s);
      const first = await march(s, p.token, p.npc.id, { infantry: 9 });
      s.now = T0 + 1000;
      const second = await march(s, p.token, p.npc.id, { infantry: 1 });
      ex(first.ok && second.ok).toBe(true);
      s.now = second.state.marches[1].arriveAt;
      await s.fireAlarm();
      const rs = await reports(s, p.token);
      ex(rs.map((r) => r.result)).toEqual(["target_gone", "victory"]);
      ex(rs[0]).toMatchObject({ survivors: { ...ZERO_TROOPS, infantry: 1 }, rounds: 0, seed: null });
    },
    "resolving again (alarm retry) changes nothing": async (s, ex) => {
      const { p, m } = await send(s);
      s.now = m.arriveAt;
      await s.fireAlarm();
      const st = await getState(s, p.token);
      // Pretend the map crashed after writing D1 but before moving on: replay the arrival.
      s.map().sql.exec("UPDATE marches SET phase = 'outbound' WHERE id = ?", m.id);
      s.map().sql.exec("UPDATE npcs SET respawn_at = NULL WHERE id = ?", m.target.npcId);
      await s.fireAlarm();
      ex(await getState(s, p.token)).toEqual(st);
      ex(await reports(s, p.token)).toHaveLength(1);
    },
    "a march the map lost comes home unharmed after the grace period": async (s, ex) => {
      const { p, m } = await send(s);
      s.map().sql.exec("DELETE FROM marches WHERE id = ?", m.id);
      s.now = m.returnAt + HOUR;
      const st = await getState(s, p.token);
      ex(st.marches).toEqual([]);
      ex(st.troops.infantry).toBe(10);
    },
    "a pending march whose base write never happened is dropped": async (s, ex) => {
      const p = await player(s);
      s.map().sql.exec(
        `INSERT INTO marches (id, account_id, npc_id, npc_level, from_x, from_y, to_x, to_y, troops, seed, depart_at, arrive_at, return_at, phase)
         VALUES ('ghost', ?, ?, 1, 0, 0, 1, 1, '{}', 1, ?, ?, ?, 'pending')`,
        p.res.account.id, p.npc.id, T0, T0 + 1000, T0 + 2000,
      );
      s.now = T0 + PENDING_TIMEOUT_MS;
      await s.fireAlarm();
      ex(s.map().sql.exec("SELECT id FROM marches WHERE id = 'ghost'")).toEqual([]);
    },
  });
}, LONG);

test("battle reports: empty list, session needed, replay from the seed", async () => {
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
  await rows({}, {
    "starts empty and needs a session": async (s, ex) => {
      const a = await newGuest(s);
      ex(await body(await s.request("GET", "/v1/reports", { token: a.token }))).toEqual({ reports: [], now: s.now });
      ex((await s.request("GET", "/v1/reports")).status).toBe(401);
    },
    "the same seed gives the same battle; the report replays from its seed": async (_s, ex) => {
      const a = await play(7);
      const b = await play(7);
      ex(b, "same seed, same battle").toEqual(a);
      const replay = fightNpc(a.report.sent, a.report.target.level, a.report.seed ?? -1);
      ex(replay.outcome).toMatchObject({ survivors: a.report.survivors, wounded: a.report.wounded, lost: a.report.lost, loot: a.report.loot });
    },
  });
}, LONG);
