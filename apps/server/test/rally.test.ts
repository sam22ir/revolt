import {
  MAX_MARCHES,
  resolveRally,
  NPC_LEVELS,
  RALLY_GATHER_OPTIONS_MS,
  RALLY_MAX_PARTICIPANTS,
  rallyTiming,
  TROOP_IDS,
  ZERO_TROOPS,
  type BattleReport,
  type MapNpcView,
  type MapSnapshot,
  type Troops,
} from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { call, MANY_GUESTS, player, post, team, type Player, type Team } from "./alliance-helpers.ts";
import { body, startServer, T0, type Json, type Server } from "./harness.ts";
import { editBase, getMap, getState, intent, march } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer(MANY_GUESTS);
});
afterEach(() => server.dispose());

const GATHER = RALLY_GATHER_OPTIONS_MS[0]!;
const t = (infantry: number, scouts = 0, heavy = 0, porters = 0): Troops => ({ infantry, scouts, heavy, porters });

const startRally = async (p: Player, target: string, troops: unknown, gather: unknown = GATHER): Promise<Json> =>
  body(await intent(server, p.token, { type: "rally_start", target, troops, gather }));
const joinRally = async (p: Player, rally: string, troops: unknown): Promise<Json> => body(await intent(server, p.token, { type: "rally_join", rally, troops }));

const reportsOf = async (p: Player): Promise<BattleReport[]> => (await call(server, p, "GET", "/v1/reports")).reports;

/** Gives a player's base `troops` at home and a plain, rich state, written straight to the base row. */
const arm = async (p: Player, troops: Troops): Promise<void> => {
  await getMap(server, p.token);
  const row = await server.env.DB.prepare("SELECT state FROM bases WHERE account_id = ?").bind(p.id).first<{ state: string }>();
  const state = JSON.parse(row?.state ?? "{}") as Json;
  state.troops = troops;
  await server.env.DB.prepare("UPDATE bases SET state = ?, version = version + 1 WHERE account_id = ?").bind(JSON.stringify(state), p.id).run();
};

const fortified = (snap: MapSnapshot): MapNpcView => {
  const npc = snap.npcs.find((n) => n.level === 4);
  if (npc === undefined) throw new Error("no level-4 target");
  return npc;
};

/** An alliance of `n` armed members (leader first) and the level-4 target. */
let teams = 0;
const setup = async (n: number, troops: Troops = t(300, 100, 100, 50)): Promise<{ tm: Team; all: Player[]; npc: MapNpcView }> => {
  teams++;
  const tm = await team(server, n, `Alliance ${teams}`, `A${teams}`);
  const all = [tm.leader, ...tm.members];
  for (const p of all) await arm(p, troops);
  return { tm, all, npc: fortified(await getMap(server, tm.leader.token)) };
};

describe("starting a rally", () => {
  test("the leader or an officer starts one: the troops leave home now, timed for the whole rally", async () => {
    const { tm, npc } = await setup(2);
    const snap = await getMap(server, tm.leader.token);
    const me = snap.bases.find((b) => b.mine)!;
    const r = await startRally(tm.leader, npc.id, t(50, 10), GATHER);
    expect(r.ok).toBe(true);
    const timing = rallyTiming(me, npc, T0 + GATHER);
    expect(r.state.troops).toMatchObject({ infantry: 250, scouts: 90 });
    expect(r.state.marches).toEqual([
      {
        id: expect.any(String),
        target: { npcId: npc.id, level: 4, x: npc.x, y: npc.y },
        from: { x: me.x, y: me.y },
        troops: t(50, 10),
        rallyId: expect.any(String),
        ...timing,
        outcome: null,
      },
    ]);
    const view = (await getMap(server, tm.members[0]!.token)).rallies;
    expect(view).toEqual([
      {
        id: r.state.marches[0].rallyId,
        leader: tm.leader.handle,
        target: { npcId: npc.id, kind: "fortified_line", level: 4, x: npc.x, y: npc.y },
        gatherUntil: T0 + GATHER,
        arriveAt: timing.arriveAt,
        returnAt: timing.returnAt,
        participants: 1,
        maxParticipants: RALLY_MAX_PARTICIPANTS,
        joined: false,
      },
    ]);
    expect((await getMap(server, tm.leader.token)).rallies[0]?.joined).toBe(true);
  });

  test("an officer may, a member may not; a stranger is no one", async () => {
    const { tm, npc } = await setup(3);
    const [officer, member] = tm.members as [Player, Player];
    await post(server, tm.leader, "/v1/alliance/promote", { handle: officer.handle });
    expect(await startRally(member, npc.id, t(10))).toMatchObject({ ok: false, reason: "no_permission" });
    expect((await startRally(officer, npc.id, t(10))).ok).toBe(true);
    const stranger = await player(server);
    await arm(stranger, t(100));
    expect(await startRally(stranger, npc.id, t(10))).toMatchObject({ ok: false, reason: "not_member" });
    expect((await getState(server, member.token)).troops.infantry).toBe(300);
  });

  test("refuses a bad gather time, an unknown target, troops it cannot send and a full march list", async () => {
    const { tm, npc } = await setup(1);
    for (const gather of [0, 1000, 61_000, -1, Number.MAX_SAFE_INTEGER]) {
      expect(await startRally(tm.leader, npc.id, t(10), gather), String(gather)).toMatchObject({ ok: false, reason: "bad_gather" });
    }
    for (const gather of ["60000", null]) {
      expect(await startRally(tm.leader, npc.id, t(10), gather), String(gather)).toEqual({ error: "bad_request" });
    }
    expect(await startRally(tm.leader, "no-such-npc", t(10))).toMatchObject({ ok: false, reason: "target_gone" });
    expect(await startRally(tm.leader, npc.id, t(10000))).toMatchObject({ ok: false, reason: "not_enough_troops" });
    expect(await startRally(tm.leader, npc.id, ZERO_TROOPS)).toMatchObject({ ok: false, reason: "no_troops" });
    expect(await startRally(tm.leader, npc.id, t(0, 0, 0, 5))).toMatchObject({ ok: false, reason: "no_troops" });
    const near = (await getMap(server, tm.leader.token)).npcs.find((n) => n.level === 1)!;
    for (let i = 0; i < MAX_MARCHES; i++) expect((await march(server, tm.leader.token, near.id, t(1))).ok).toBe(true);
    expect(await startRally(tm.leader, npc.id, t(10))).toMatchObject({ ok: false, reason: "too_many_marches" });
    expect((await getMap(server, tm.leader.token)).rallies).toEqual([]);
  });

  test("tampered intents are 400 and change nothing", async () => {
    const { tm, npc } = await setup(1);
    const bad: unknown[] = [
      { type: "rally_start", target: npc.id, troops: { infantry: -1 }, gather: GATHER },
      { type: "rally_start", target: npc.id, troops: { infantry: 1.5 }, gather: GATHER },
      { type: "rally_start", target: npc.id, troops: { cavalry: 5 }, gather: GATHER },
      { type: "rally_start", target: npc.id, troops: { infantry: 5 } },
      { type: "rally_start", troops: { infantry: 5 }, gather: GATHER },
      { type: "rally_join", troops: { infantry: 5 } },
      { type: "rally_join", rally: "x".repeat(65), troops: { infantry: 5 } },
      { type: "rally_join", rally: 5, troops: { infantry: 5 } },
    ];
    for (const b of bad) expect((await intent(server, tm.leader.token, b)).status, JSON.stringify(b)).toBe(400);
    expect((await getState(server, tm.leader.token)).troops.infantry).toBe(300);
  });

  test("a solo march against a rally-only target is refused", async () => {
    const { tm, npc } = await setup(1);
    expect(await march(server, tm.leader.token, npc.id, t(50))).toMatchObject({ ok: false, reason: "rally_only" });
    expect((await getState(server, tm.leader.token)).troops.infantry).toBe(300);
    expect(NPC_LEVELS[3]!.rallyOnly).toBe(true);
  });

  test("the seed is never visible while the rally is out, and strangers see no rally", async () => {
    const { tm, npc } = await setup(2);
    await startRally(tm.leader, npc.id, t(50));
    const outsider = await player(server);
    expect((await getMap(server, outsider.token)).rallies).toEqual([]);
    expect(JSON.stringify(await getMap(server, tm.members[0]!.token))).not.toContain("seed");
  });
});

describe("joining a rally", () => {
  const started = async (n = 3) => {
    const s = await setup(n);
    const r = await startRally(s.tm.leader, s.npc.id, t(40, 10));
    return { ...s, rally: r.state.marches[0] as Json };
  };

  test("a member's troops leave home with the rally's timing", async () => {
    const { tm, rally } = await started();
    const m = tm.members[0]!;
    const r = await joinRally(m, rally.rallyId, t(30, 5, 5));
    expect(r.ok).toBe(true);
    expect(r.state.troops).toMatchObject({ infantry: 270, scouts: 95, heavy: 95 });
    expect(r.state.marches[0]).toMatchObject({ rallyId: rally.rallyId, departAt: rally.departAt, arriveAt: rally.arriveAt, returnAt: rally.returnAt, troops: t(30, 5, 5) });
    expect((await getMap(server, m.token)).rallies[0]).toMatchObject({ participants: 2, joined: true });
  });

  test("once only; not after the gathering; not a stranger or another alliance; not an unknown rally", async () => {
    const { tm, rally } = await started();
    const m = tm.members[0]!;
    await joinRally(m, rally.rallyId, t(10));
    expect(await joinRally(m, rally.rallyId, t(10))).toMatchObject({ ok: false, reason: "already_in_rally" });
    expect(await joinRally(tm.leader, rally.rallyId, t(10))).toMatchObject({ ok: false, reason: "already_in_rally" });
    const other = await setup(1);
    expect(await joinRally(other.tm.leader, rally.rallyId, t(10))).toMatchObject({ ok: false, reason: "rally_gone" });
    expect(await joinRally(m, "no-such-rally", t(10))).toMatchObject({ ok: false, reason: "rally_gone" });
    const stranger = await player(server);
    await arm(stranger, t(100));
    expect(await joinRally(stranger, rally.rallyId, t(10))).toMatchObject({ ok: false, reason: "not_member" });
    const late = tm.members[1]!;
    server.now = T0 + GATHER;
    expect(await joinRally(late, rally.rallyId, t(10))).toMatchObject({ ok: false, reason: "rally_closed" });
    expect((await getState(server, late.token)).troops.infantry).toBe(300);
  });

  test("refuses troops it cannot send or nothing to fight with; joiners count against the march list", async () => {
    const { tm, rally } = await started();
    const m = tm.members[0]!;
    expect(await joinRally(m, rally.rallyId, t(9999))).toMatchObject({ ok: false, reason: "not_enough_troops" });
    expect(await joinRally(m, rally.rallyId, ZERO_TROOPS)).toMatchObject({ ok: false, reason: "no_troops" });
    const near = (await getMap(server, m.token)).npcs.find((n) => n.level === 1)!;
    for (let i = 0; i < MAX_MARCHES; i++) await march(server, m.token, near.id, t(1));
    expect(await joinRally(m, rally.rallyId, t(10))).toMatchObject({ ok: false, reason: "too_many_marches" });
  });

  test(`at most ${RALLY_MAX_PARTICIPANTS} take part`, async () => {
    const { tm, rally } = await started(RALLY_MAX_PARTICIPANTS + 2);
    for (let i = 0; i < RALLY_MAX_PARTICIPANTS - 1; i++) expect((await joinRally(tm.members[i]!, rally.rallyId, t(10))).ok, `joiner ${i}`).toBe(true);
    expect(await joinRally(tm.members[RALLY_MAX_PARTICIPANTS - 1]!, rally.rallyId, t(10))).toMatchObject({ ok: false, reason: "rally_full" });
  });

  test("two members racing for the last place: exactly one", async () => {
    const { tm, rally } = await started(RALLY_MAX_PARTICIPANTS + 3);
    for (let i = 0; i < RALLY_MAX_PARTICIPANTS - 2; i++) await joinRally(tm.members[i]!, rally.rallyId, t(10));
    const racers = tm.members.slice(RALLY_MAX_PARTICIPANTS - 2, RALLY_MAX_PARTICIPANTS + 1);
    const rs = await Promise.all(racers.map((p) => joinRally(p, rally.rallyId, t(10))));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect((await getMap(server, tm.leader.token)).rallies[0]?.participants).toBe(RALLY_MAX_PARTICIPANTS);
  });
});

describe("the rally arrives", () => {
  const sum = (ts: Troops[]): Troops => TROOP_IDS.reduce((acc, id) => ({ ...acc, [id]: ts.reduce((n, x) => n + x[id], 0) }), t(0));

  /** Everyone joins with their own mix; returns what each sent and the rally's timing. */
  const run = async (troops: Troops[]) => {
    const s = await setup(troops.length, ARMED);
    const rally = (await startRally(s.tm.leader, s.npc.id, troops[0]!)).state.marches[0] as Json;
    for (let i = 1; i < troops.length; i++) {
      const r = await joinRally(s.tm.members[i - 1]!, rally.rallyId, troops[i]);
      if (!r.ok) throw new Error(r.reason);
    }
    server.now = rally.arriveAt;
    await server.fireAlarm();
    return { ...s, rally };
  };

  const ARMED = t(1000, 400, 400, 60);
  const MIX = [t(120, 40, 30), t(90, 0, 60, 5), t(200, 20, 0)];

  test("one battle: each participant gets a report with their own share, and the shares add up to the whole", async () => {
    const { all, npc, rally } = await run(MIX);
    const reports = await Promise.all(all.map(async (p) => (await reportsOf(p))[0]!));
    for (const [i, r] of reports.entries()) {
      expect(r.sent).toEqual(MIX[i]);
      expect(r.target).toEqual({ kind: "fortified_line", level: 4, x: npc.x, y: npc.y });
      expect(r.at).toBe(rally.arriveAt);
      expect(r.defenders).toEqual(NPC_LEVELS[3]!.defenders);
      for (const id of TROOP_IDS) {
        expect(r.survivors[id] + r.wounded[id] + r.lost[id], `${i} ${id}`).toBe(r.sent[id]);
        expect(Math.min(r.survivors[id], r.wounded[id], r.lost[id])).toBeGreaterThanOrEqual(0);
      }
    }
    // They fought together: one result, one set of defender losses, one seed.
    expect(new Set(reports.map((r) => r.result)).size).toBe(1);
    expect(new Set(reports.map((r) => JSON.stringify(r.defendersKilled))).size).toBe(1);
    expect(new Set(reports.map((r) => r.seed)).size).toBe(1);
    expect(new Set(reports.map((r) => r.rounds)).size).toBe(1);
    expect(sum(reports.map((r) => r.sent))).toEqual(sum(MIX));
    const total = (pick: (r: BattleReport) => Troops): Troops => sum(reports.map(pick));
    expect(sum([total((r) => r.survivors), total((r) => r.wounded), total((r) => r.lost)])).toEqual(sum(MIX));
  });

  test("each base gets its own outcome, and the troops come home at the rally's return time", async () => {
    const { all, rally } = await run(MIX);
    const reports = await Promise.all(all.map(async (p) => (await reportsOf(p))[0]!));
    for (const [i, p] of all.entries()) {
      const s = await getState(server, p.token);
      expect(s.marches).toHaveLength(1);
      expect(s.marches[0].outcome).toMatchObject({ survivors: reports[i]!.survivors, wounded: reports[i]!.wounded, lost: reports[i]!.lost, loot: reports[i]!.loot });
    }
    server.now = rally.returnAt;
    await server.fireAlarm();
    for (const [i, p] of all.entries()) {
      const s = await getState(server, p.token);
      expect(s.marches).toEqual([]);
      for (const id of TROOP_IDS) {
        expect(s.troops[id]).toBe(ARMED[id] - MIX[i]![id] + reports[i]!.survivors[id]);
        expect(s.wounded[id]).toBe(reports[i]!.wounded[id]);
      }
    }
    expect((await getMap(server, all[0]!.token)).rallies).toEqual([]);
    expect((await getMap(server, all[0]!.token)).marches).toEqual([]);
  });

  test("a strong rally wins, takes the target off the map and shares the loot", async () => {
    const strong = [t(900, 300, 300, 40), t(900, 300, 300, 40)];
    const { all, npc } = await run(strong);
    const reports = await Promise.all(all.map(async (p) => (await reportsOf(p))[0]!));
    expect(reports.map((r) => r.result)).toEqual(["victory", "victory"]);
    const loot = (k: "food" | "materiel" | "funds"): number => reports.reduce((n, r) => n + r.loot[k], 0);
    expect(loot("food")).toBeGreaterThan(0);
    expect(loot("food")).toBeLessThanOrEqual(NPC_LEVELS[3]!.loot.food);
    expect((await getMap(server, all[0]!.token)).npcs.some((n) => n.id === npc.id)).toBe(false);
  });

  test("a rally whose target is gone on arrival comes home untouched", async () => {
    const s = await setup(2);
    const rally = (await startRally(s.tm.leader, s.npc.id, t(40))).state.marches[0] as Json;
    await joinRally(s.tm.members[0]!, rally.rallyId, t(60));
    server.map().sql.exec("UPDATE npcs SET respawn_at = ? WHERE id = ?", T0 + 10 * rally.arriveAt, s.npc.id);
    server.now = rally.arriveAt;
    await server.fireAlarm();
    for (const [p, sent] of [[s.tm.leader, t(40)], [s.tm.members[0]!, t(60)]] as const) {
      const [r] = await reportsOf(p);
      expect(r).toMatchObject({ result: "target_gone", sent, survivors: sent, rounds: 0, seed: null });
    }
  });

  test("nothing happens before the arrival; the alarm is set for it", async () => {
    const s = await setup(2);
    const rally = (await startRally(s.tm.leader, s.npc.id, t(40))).state.marches[0] as Json;
    expect(server.map().alarmAt).toBe(rally.arriveAt - T0);
    server.now = rally.arriveAt - 1;
    await server.fireAlarm();
    expect(await reportsOf(s.tm.leader)).toEqual([]);
    expect((await getState(server, s.tm.leader.token)).marches[0].outcome).toBeNull();
  });

  test("the same seed gives the same battle and the same shares; the report replays from its seed", async () => {
    const play = async (): Promise<BattleReport[]> => {
      const local = await startServer(MANY_GUESTS);
      local.mapSeed = 5;
      const saved = server;
      server = local;
      try {
        const { all } = await run(MIX);
        return (await Promise.all(all.map(async (p) => (await reportsOf(p))[0]!))).map((r) => ({ ...r, id: "" }));
      } finally {
        server = saved;
        await local.dispose();
      }
    };
    const [a, b] = [await play(), await play()];
    expect(b).toEqual(a);
    expect(a[0]!.seed).not.toBeNull();
  });

  test("resolving twice (an alarm retry) changes nothing", async () => {
    const { all, rally } = await run(MIX);
    const before = await Promise.all(all.map(async (p) => ({ s: await getState(server, p.token), r: await reportsOf(p) })));
    server.map().sql.exec("UPDATE rallies SET status = 'open' WHERE id = ?", rally.rallyId);
    server.map().sql.exec("UPDATE marches SET phase = 'outbound' WHERE rally_id = ?", rally.rallyId);
    server.map().sql.exec("UPDATE npcs SET respawn_at = NULL WHERE id = ?", rally.target.npcId);
    await server.fireAlarm();
    const after = await Promise.all(all.map(async (p) => ({ s: await getState(server, p.token), r: await reportsOf(p) })));
    expect(after).toEqual(before);
  });

  test("a participant who left the alliance still fights and gets home with their share", async () => {
    const s = await setup(3);
    const rally = (await startRally(s.tm.leader, s.npc.id, t(80, 20, 20))).state.marches[0] as Json;
    const m = s.tm.members[0]!;
    await joinRally(m, rally.rallyId, t(80, 20, 20));
    await post(server, m, "/v1/alliance/leave");
    server.now = rally.arriveAt;
    await server.fireAlarm();
    expect(await reportsOf(m)).toHaveLength(1);
  });
});
