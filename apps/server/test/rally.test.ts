import {
  advance,
  createBaseState,
  MAX_MARCHES,
  resolveRally,
  NPC_LEVELS,
  NPC_RESPAWN_MS,
  RALLY_GATHER_OPTIONS_MS,
  RALLY_MAX_PARTICIPANTS,
  rallyTiming,
  TROOP_IDS,
  ZERO_TROOPS,
  type BattleReport,
  type MapNpcView,
  type MapSnapshot,
  type Troops,
  type World,
} from "@revolt/rules";
import { expect, test } from "vitest";
import { call, MANY_GUESTS, player, post, team, type Player, type Team } from "./alliance-helpers.ts";
import { body, HOUR, startServer, T0, type Json, type Server } from "./harness.ts";
import { getMap, getState, intent, march } from "./map-helpers.ts";
import { LONG, rows } from "./rows.ts";

const GATHER = RALLY_GATHER_OPTIONS_MS[0]!;
const t = (infantry: number, scouts = 0, heavy = 0, porters = 0): Troops => ({ infantry, scouts, heavy, porters });

const startRally = async (s: Server, p: Player, target: string, troops: unknown, gather: unknown = GATHER): Promise<Json> =>
  body(await intent(s, p.token, { type: "rally_start", target, troops, gather }));
const joinRally = async (s: Server, p: Player, rally: string, troops: unknown): Promise<Json> => body(await intent(s, p.token, { type: "rally_join", rally, troops }));
const reportsOf = async (s: Server, p: Player): Promise<BattleReport[]> => (await call(s, p, "GET", "/v1/reports")).reports;

/** Gives a player's base `troops` at home, written straight to the base row. */
const arm = async (s: Server, p: Player, troops: Troops): Promise<void> => {
  await getMap(s, p.token);
  const row = await s.env.DB.prepare("SELECT state FROM bases WHERE account_id = ?").bind(p.id).first<{ state: string }>();
  const state = JSON.parse(row?.state ?? "{}") as Json;
  state.troops = troops;
  await s.env.DB.prepare("UPDATE bases SET state = ?, version = version + 1 WHERE account_id = ?").bind(JSON.stringify(state), p.id).run();
};

const fortified = (snap: MapSnapshot): MapNpcView => {
  const npc = snap.npcs.find((n) => n.level === 4);
  if (npc === undefined) throw new Error("no level-4 target");
  return npc;
};

/** An alliance of `n` armed members (leader first) and the level-4 target. */
let teams = 0;
const setup = async (s: Server, n: number, troops: Troops = t(300, 100, 100, 50)): Promise<{ tm: Team; all: Player[]; npc: MapNpcView }> => {
  teams++;
  const tm = await team(s, n, `Alliance ${teams}`, `A${teams}`);
  const all = [tm.leader, ...tm.members];
  for (const p of all) await arm(s, p, troops);
  return { tm, all, npc: fortified(await getMap(s, tm.leader.token)) };
};

const started = async (s: Server, n = 3) => {
  const x = await setup(s, n);
  const r = await startRally(s, x.tm.leader, x.npc.id, t(40, 10));
  return { ...x, rally: r.state.marches[0] as Json };
};

const sum = (ts: Troops[]): Troops => TROOP_IDS.reduce((acc, id) => ({ ...acc, [id]: ts.reduce((n, x) => n + x[id], 0) }), t(0));
const ARMED = t(1000, 400, 400, 60);
const MIX = [t(120, 40, 30), t(90, 0, 60, 5), t(200, 20, 0)];

/** Everyone joins with their own mix, then the rally arrives. */
const run = async (s: Server, troops: Troops[]) => {
  const x = await setup(s, troops.length, ARMED);
  const rally = (await startRally(s, x.tm.leader, x.npc.id, troops[0]!)).state.marches[0] as Json;
  for (let i = 1; i < troops.length; i++) {
    const r = await joinRally(s, x.tm.members[i - 1]!, rally.rallyId, troops[i]);
    if (!r.ok) throw new Error(r.reason);
  }
  s.now = rally.arriveAt;
  await s.fireAlarm();
  return { ...x, rally };
};

test("rally: starting, permissions, refusals, tampering, secrecy", async () => {
  await rows(MANY_GUESTS, {
    "the leader or an officer starts one: the troops leave home now, timed for the whole rally": async (s, ex) => {
      const { tm, npc } = await setup(s, 2);
      const snap = await getMap(s, tm.leader.token);
      const me = snap.bases.find((b) => b.mine)!;
      const r = await startRally(s, tm.leader, npc.id, t(50, 10), GATHER);
      ex(r.ok).toBe(true);
      const timing = rallyTiming(me, npc, T0 + GATHER);
      ex(r.state.troops).toMatchObject({ infantry: 250, scouts: 90 });
      ex(r.state.marches).toEqual([
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
      const view = (await getMap(s, tm.members[0]!.token)).rallies;
      ex(view).toEqual([
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
      ex((await getMap(s, tm.leader.token)).rallies[0]?.joined, "the leader is in it").toBe(true);
    },
    "an officer may, a member may not; a stranger is no one": async (s, ex) => {
      const { tm, npc } = await setup(s, 3);
      const [officer, member] = tm.members as [Player, Player];
      await post(s, tm.leader, "/v1/alliance/promote", { handle: officer.handle });
      ex(await startRally(s, member, npc.id, t(10)), "member").toMatchObject({ ok: false, reason: "no_permission" });
      ex((await startRally(s, officer, npc.id, t(10))).ok, "officer").toBe(true);
      const stranger = await player(s);
      await arm(s, stranger, t(100));
      ex(await startRally(s, stranger, npc.id, t(10)), "stranger").toMatchObject({ ok: false, reason: "not_member" });
      ex((await getState(s, member.token)).troops.infantry).toBe(300);
    },
    "refuses a bad gather time, an unknown target, troops it cannot send and a full march list": async (s, ex) => {
      const { tm, npc } = await setup(s, 1);
      for (const gather of [0, 1000, 61_000, -1, Number.MAX_SAFE_INTEGER]) {
        ex(await startRally(s, tm.leader, npc.id, t(10), gather), `gather ${gather}`).toMatchObject({ ok: false, reason: "bad_gather" });
      }
      for (const gather of ["60000", null]) {
        ex(await startRally(s, tm.leader, npc.id, t(10), gather), `gather ${String(gather)}`).toEqual({ error: "bad_request" });
      }
      ex(await startRally(s, tm.leader, "no-such-npc", t(10)), "unknown target").toMatchObject({ ok: false, reason: "target_gone" });
      ex(await startRally(s, tm.leader, npc.id, t(10000)), "too many troops").toMatchObject({ ok: false, reason: "not_enough_troops" });
      ex(await startRally(s, tm.leader, npc.id, ZERO_TROOPS), "no troops").toMatchObject({ ok: false, reason: "no_troops" });
      ex(await startRally(s, tm.leader, npc.id, t(0, 0, 0, 5)), "only porters").toMatchObject({ ok: false, reason: "no_troops" });
      const near = (await getMap(s, tm.leader.token)).npcs.find((n) => n.level === 1)!;
      for (let i = 0; i < MAX_MARCHES; i++) ex((await march(s, tm.leader.token, near.id, t(1))).ok, `march ${i}`).toBe(true);
      ex(await startRally(s, tm.leader, npc.id, t(10)), "march list full").toMatchObject({ ok: false, reason: "too_many_marches" });
      ex((await getMap(s, tm.leader.token)).rallies).toEqual([]);
    },
    "tampered intents are 400 and change nothing": async (s, ex) => {
      const { tm, npc } = await setup(s, 1);
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
      for (const b of bad) ex((await intent(s, tm.leader.token, b)).status, JSON.stringify(b)).toBe(400);
      ex((await getState(s, tm.leader.token)).troops.infantry).toBe(300);
    },
    "a solo march against a rally-only target is refused": async (s, ex) => {
      const { tm, npc } = await setup(s, 1);
      ex(await march(s, tm.leader.token, npc.id, t(50))).toMatchObject({ ok: false, reason: "rally_only" });
      ex((await getState(s, tm.leader.token)).troops.infantry).toBe(300);
      ex(NPC_LEVELS[3]!.rallyOnly).toBe(true);
    },
    "the seed is never visible while the rally is out, and strangers see no rally": async (s, ex) => {
      const { tm, npc } = await setup(s, 2);
      await startRally(s, tm.leader, npc.id, t(50));
      const outsider = await player(s);
      ex((await getMap(s, outsider.token)).rallies).toEqual([]);
      ex(JSON.stringify(await getMap(s, tm.members[0]!.token))).not.toContain("seed");
    },
  });
}, LONG);

test("rally: joining, limits, permissions, races", async () => {
  await rows(MANY_GUESTS, {
    "a member's troops leave home with the rally's timing": async (s, ex) => {
      const { tm, rally } = await started(s);
      const m = tm.members[0]!;
      const r = await joinRally(s, m, rally.rallyId, t(30, 5, 5));
      ex(r.ok).toBe(true);
      ex(r.state.troops).toMatchObject({ infantry: 270, scouts: 95, heavy: 95 });
      ex(r.state.marches[0]).toMatchObject({ rallyId: rally.rallyId, departAt: rally.departAt, arriveAt: rally.arriveAt, returnAt: rally.returnAt, troops: t(30, 5, 5) });
      ex((await getMap(s, m.token)).rallies[0]).toMatchObject({ participants: 2, joined: true });
    },
    "once only; not after the gathering; not a stranger or another alliance; not an unknown rally": async (s, ex) => {
      const { tm, rally } = await started(s);
      const m = tm.members[0]!;
      await joinRally(s, m, rally.rallyId, t(10));
      ex(await joinRally(s, m, rally.rallyId, t(10)), "twice").toMatchObject({ ok: false, reason: "already_in_rally" });
      ex(await joinRally(s, tm.leader, rally.rallyId, t(10)), "the leader again").toMatchObject({ ok: false, reason: "already_in_rally" });
      const other = await setup(s, 1);
      ex(await joinRally(s, other.tm.leader, rally.rallyId, t(10)), "another alliance").toMatchObject({ ok: false, reason: "rally_gone" });
      ex(await joinRally(s, m, "no-such-rally", t(10)), "unknown rally").toMatchObject({ ok: false, reason: "rally_gone" });
      const stranger = await player(s);
      await arm(s, stranger, t(100));
      ex(await joinRally(s, stranger, rally.rallyId, t(10)), "stranger").toMatchObject({ ok: false, reason: "not_member" });
      const late = tm.members[1]!;
      s.now = T0 + GATHER;
      ex(await joinRally(s, late, rally.rallyId, t(10)), "after the gathering").toMatchObject({ ok: false, reason: "rally_closed" });
      ex((await getState(s, late.token)).troops.infantry).toBe(300);
    },
    "refuses troops it cannot send or nothing to fight with; joiners count against the march list": async (s, ex) => {
      const { tm, rally } = await started(s);
      const m = tm.members[0]!;
      ex(await joinRally(s, m, rally.rallyId, t(9999)), "too many troops").toMatchObject({ ok: false, reason: "not_enough_troops" });
      ex(await joinRally(s, m, rally.rallyId, ZERO_TROOPS), "no troops").toMatchObject({ ok: false, reason: "no_troops" });
      const near = (await getMap(s, m.token)).npcs.find((n) => n.level === 1)!;
      for (let i = 0; i < MAX_MARCHES; i++) await march(s, m.token, near.id, t(1));
      ex(await joinRally(s, m, rally.rallyId, t(10)), "march list full").toMatchObject({ ok: false, reason: "too_many_marches" });
    },
    [`at most ${RALLY_MAX_PARTICIPANTS} take part`]: async (s, ex) => {
      const { tm, rally } = await started(s, RALLY_MAX_PARTICIPANTS + 2);
      for (let i = 0; i < RALLY_MAX_PARTICIPANTS - 1; i++) ex((await joinRally(s, tm.members[i]!, rally.rallyId, t(10))).ok, `joiner ${i}`).toBe(true);
      ex(await joinRally(s, tm.members[RALLY_MAX_PARTICIPANTS - 1]!, rally.rallyId, t(10))).toMatchObject({ ok: false, reason: "rally_full" });
    },
    "two members racing for the last place: exactly one": async (s, ex) => {
      const { tm, rally } = await started(s, RALLY_MAX_PARTICIPANTS + 3);
      for (let i = 0; i < RALLY_MAX_PARTICIPANTS - 2; i++) await joinRally(s, tm.members[i]!, rally.rallyId, t(10));
      const racers = tm.members.slice(RALLY_MAX_PARTICIPANTS - 2, RALLY_MAX_PARTICIPANTS + 1);
      const rs = await Promise.all(racers.map((p) => joinRally(s, p, rally.rallyId, t(10))));
      ex(rs.filter((r) => r.ok)).toHaveLength(1);
      ex((await getMap(s, tm.leader.token)).rallies[0]?.participants).toBe(RALLY_MAX_PARTICIPANTS);
    },
  });
}, LONG);

test("rally: arrival, shared battle, return, retries, determinism", async () => {
  await rows(MANY_GUESTS, {
    "one battle: each participant gets a report with their own share, and the shares add up to the whole": async (s, ex) => {
      const { all, npc, rally } = await run(s, MIX);
      const reports = await Promise.all(all.map(async (p) => (await reportsOf(s, p))[0]!));
      for (const [i, r] of reports.entries()) {
        ex(r.sent, `${i} sent`).toEqual(MIX[i]);
        ex(r.target, `${i} target`).toEqual({ kind: "fortified_line", level: 4, x: npc.x, y: npc.y });
        ex(r.at, `${i} at`).toBe(rally.arriveAt);
        ex(r.defenders, `${i} defenders`).toEqual(NPC_LEVELS[3]!.defenders);
        for (const id of TROOP_IDS) {
          ex(r.survivors[id] + r.wounded[id] + r.lost[id], `${i} ${id}`).toBe(r.sent[id]);
          ex(Math.min(r.survivors[id], r.wounded[id], r.lost[id]), `${i} ${id} non-negative`).toBeGreaterThanOrEqual(0);
        }
      }
      // They fought together: one result, one set of defender losses, one seed.
      ex(new Set(reports.map((r) => r.result)).size, "one result").toBe(1);
      ex(new Set(reports.map((r) => JSON.stringify(r.defendersKilled))).size, "one set of defender losses").toBe(1);
      ex(new Set(reports.map((r) => r.seed)).size, "one seed").toBe(1);
      ex(new Set(reports.map((r) => r.rounds)).size, "one round count").toBe(1);
      ex(sum(reports.map((r) => r.sent)), "shares add up to what was sent").toEqual(sum(MIX));
      const total = (pick: (r: BattleReport) => Troops): Troops => sum(reports.map(pick));
      ex(sum([total((r) => r.survivors), total((r) => r.wounded), total((r) => r.lost)]), "survivors+wounded+lost").toEqual(sum(MIX));
    },
    "each base gets its own outcome, and the troops come home at the rally's return time": async (s, ex) => {
      const { all, rally } = await run(s, MIX);
      const reports = await Promise.all(all.map(async (p) => (await reportsOf(s, p))[0]!));
      for (const [i, p] of all.entries()) {
        const st = await getState(s, p.token);
        ex(st.marches, `${i} marches`).toHaveLength(1);
        ex(st.marches[0].outcome, `${i} outcome`).toMatchObject({ survivors: reports[i]!.survivors, wounded: reports[i]!.wounded, lost: reports[i]!.lost, loot: reports[i]!.loot });
      }
      s.now = rally.returnAt;
      await s.fireAlarm();
      for (const [i, p] of all.entries()) {
        const st = await getState(s, p.token);
        ex(st.marches, `${i} home`).toEqual([]);
        for (const id of TROOP_IDS) {
          ex(st.troops[id], `${i} troops ${id}`).toBe(ARMED[id] - MIX[i]![id] + reports[i]!.survivors[id]);
          ex(st.wounded[id], `${i} wounded ${id}`).toBe(reports[i]!.wounded[id]);
        }
      }
      ex((await getMap(s, all[0]!.token)).rallies).toEqual([]);
      ex((await getMap(s, all[0]!.token)).marches).toEqual([]);
    },
    "a strong rally wins, takes the target off the map and shares the loot": async (s, ex) => {
      const strong = [t(900, 300, 300, 40), t(900, 300, 300, 40)];
      const { all, npc } = await run(s, strong);
      const reports = await Promise.all(all.map(async (p) => (await reportsOf(s, p))[0]!));
      ex(reports.map((r) => r.result)).toEqual(["victory", "victory"]);
      const loot = (k: "food" | "materiel" | "funds"): number => reports.reduce((n, r) => n + r.loot[k], 0);
      ex(loot("food")).toBeGreaterThan(0);
      ex(loot("food")).toBeLessThanOrEqual(NPC_LEVELS[3]!.loot.food);
      ex((await getMap(s, all[0]!.token)).npcs.some((n) => n.id === npc.id)).toBe(false);
    },
    "a rally whose target is gone on arrival comes home untouched": async (s, ex) => {
      const x = await setup(s, 2);
      const rally = (await startRally(s, x.tm.leader, x.npc.id, t(40))).state.marches[0] as Json;
      await joinRally(s, x.tm.members[0]!, rally.rallyId, t(60));
      s.map().sql.exec("UPDATE npcs SET respawn_at = ? WHERE id = ?", T0 + 10 * rally.arriveAt, x.npc.id);
      s.now = rally.arriveAt;
      await s.fireAlarm();
      for (const [p, sent] of [[x.tm.leader, t(40)], [x.tm.members[0]!, t(60)]] as const) {
        const [r] = await reportsOf(s, p);
        ex(r).toMatchObject({ result: "target_gone", sent, survivors: sent, rounds: 0, seed: null });
      }
    },
    "nothing happens before the arrival; the alarm is set for it": async (s, ex) => {
      const x = await setup(s, 2);
      const rally = (await startRally(s, x.tm.leader, x.npc.id, t(40))).state.marches[0] as Json;
      ex(s.map().alarmAt).toBe(rally.arriveAt - T0);
      s.now = rally.arriveAt - 1;
      await s.fireAlarm();
      ex(await reportsOf(s, x.tm.leader)).toEqual([]);
      ex((await getState(s, x.tm.leader.token)).marches[0].outcome).toBeNull();
    },
    "the same seed gives the same battle and the same shares; the report replays from its seed": async (_s, ex) => {
      const play = async (): Promise<BattleReport[]> => {
        const local = await startServer(MANY_GUESTS);
        local.mapSeed = 5;
        try {
          const { all } = await run(local, MIX);
          return (await Promise.all(all.map(async (p) => (await reportsOf(local, p))[0]!))).map((r) => ({ ...r, id: "" }));
        } finally {
          await local.dispose();
        }
      };
      const [a, b] = [await play(), await play()];
      ex(b, "same seed, same reports").toEqual(a);
      ex(a[0]!.seed).not.toBeNull();
    },
    "resolving twice (an alarm retry) changes nothing": async (s, ex) => {
      const { all, rally } = await run(s, MIX);
      const before = await Promise.all(all.map(async (p) => ({ s: await getState(s, p.token), r: await reportsOf(s, p) })));
      s.map().sql.exec("UPDATE rallies SET status = 'open' WHERE id = ?", rally.rallyId);
      s.map().sql.exec("UPDATE marches SET phase = 'outbound' WHERE rally_id = ?", rally.rallyId);
      s.map().sql.exec("UPDATE npcs SET respawn_at = NULL WHERE id = ?", rally.target.npcId);
      await s.fireAlarm();
      const after = await Promise.all(all.map(async (p) => ({ s: await getState(s, p.token), r: await reportsOf(s, p) })));
      ex(after).toEqual(before);
    },
    "a participant who left the alliance still fights and gets home with their share": async (s, ex) => {
      const x = await setup(s, 3);
      const rally = (await startRally(s, x.tm.leader, x.npc.id, t(80, 20, 20))).state.marches[0] as Json;
      const m = x.tm.members[0]!;
      await joinRally(s, m, rally.rallyId, t(80, 20, 20));
      await post(s, m, "/v1/alliance/leave");
      s.now = rally.arriveAt;
      await s.fireAlarm();
      ex(await reportsOf(s, m)).toHaveLength(1);
    },
  });
}, LONG);

test("rally: liberating a region", async () => {
  const BIG = t(1000, 400, 400, 60);
  /** An alliance clears the level-4 stronghold with overwhelming force; a bystander's base predates the win. */
  const clear = async (s: Server) => {
    const bystander = await player(s);
    const x = await setup(s, 1, BIG);
    const rally = (await startRally(s, x.tm.leader, x.npc.id, BIG)).state.marches[0] as Json;
    s.now = rally.arriveAt;
    await s.fireAlarm();
    return { ...x, rally, bystander };
  };
  await rows(MANY_GUESTS, {
    "clearing a stronghold liberates its region, credited to the alliance and stamped when the map recorded it": async (s, ex) => {
      const { tm, npc, rally } = await clear(s);
      ex(npc.region).not.toBeNull();
      const snap = await getMap(s, tm.leader.token);
      ex(snap.liberations).toEqual([{ region: npc.region, from: rally.arriveAt, until: null, alliance: `A${teams}` }]);
      ex(snap.npcs.some((n) => n.id === npc.id)).toBe(false);
      const d1 = await s.env.DB.prepare("SELECT server, region, from_at, until_at FROM liberations").all<Json>();
      ex(d1.results).toEqual([{ server: "algeria-1", region: npc.region, from_at: rally.arriveAt, until_at: null }]);
    },
    "a cleared stronghold stays down: the roaming respawn never brings it back": async (s, ex) => {
      const { tm, npc } = await clear(s);
      s.now += 100 * NPC_RESPAWN_MS;
      await s.fireAlarm();
      const snap = await getMap(s, tm.leader.token);
      ex(snap.npcs.some((n) => n.id === npc.id || n.region === npc.region)).toBe(false);
      ex(snap.liberations).toHaveLength(1);
      // Nothing left to resolve: the alarm must not be set to the stronghold's never-reached sentinel.
      ex(s.map().alarmAt).toBeNull();
    },
    "the bonus reaches every base from the recorded time on, not before": async (s, ex) => {
      const { bystander, npc, rally } = await clear(s);
      const at = rally.arriveAt + HOUR;
      s.now = at;
      const world: World = { liberations: [{ region: npc.region!, from: rally.arriveAt, until: null }] };
      const got = await body(await s.request("GET", "/v1/state", { token: bystander.token }));
      ex(got.liberations).toEqual(world.liberations);
      const expected = advance(createBaseState(T0), at, world);
      ex(got.state.resources).toEqual(expected.resources);
      ex(got.state.resources.food).toBeGreaterThan(advance(createBaseState(T0), at, { liberations: [] }).resources.food);
    },
  });
}, LONG);
