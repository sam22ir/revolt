import { DAILY_MISSIONS, metricKey, missionDay, missionDayStart, passSeasonAt, QUEST_IDS, QUESTS, storageCap } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { create as createAlliance, join, player as allianceMember } from "./alliance-helpers.ts";
import { HOUR, startServer, type Server } from "./harness.ts";
import { fighter, get, inWindow, post, sql, winBattle } from "./live-helpers.ts";
import { editBase, getState, intent } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer({ GUEST_LIMIT_PER_HOUR: "100000" });
  server.now = inWindow("supply_route", 40);
});
afterEach(() => server.dispose());

const today = (): number => missionDay(server.now, "algeria");
const daily = async (token: string, id: string) => ((await get(server, token, "/v1/missions")).daily as { id: string; progress: number; done: boolean; claimed: boolean }[]).find((m) => m.id === id)!;
const seedTicks = async (accountId: string, metric: string, points: number): Promise<void> => {
  await server.env.DB
    .prepare("INSERT INTO mission_ticks (account_id, source, key, points, at) VALUES (?, ?, ?, ?, ?)")
    .bind(accountId, `seed-${Math.random()}`, metricKey(today(), metric as never), points, server.now)
    .run();
};

describe("daily missions", () => {
  test("a new player sees today's missions at zero and the next reset", async () => {
    const f = await fighter(server);
    const v = await get(server, f.token, "/v1/missions");
    expect(v.day).toBe(today());
    expect(v.resetsAt).toBe(missionDayStart(today() + 1, "algeria"));
    expect(v.daily.map((m: { id: string }) => m.id)).toEqual(Object.keys(DAILY_MISSIONS));
    for (const m of v.daily) expect(m).toMatchObject({ progress: 0, done: false, claimed: false });
  });

  test("upgrades and training count, once per accepted intent; refusals count nothing", async () => {
    const f = await fighter(server);
    await editBase(server, f.id, (s) => {
      s.resources = { food: 5000, materiel: 5000, funds: 5000, support: 0 };
    });
    expect((await (await intent(server, f.token, { type: "upgrade", building: "hq" })).json()).ok).toBe(true);
    // The queue is busy: refused, so nothing is counted.
    expect((await (await intent(server, f.token, { type: "upgrade", building: "farm" })).json()).ok).toBe(false);
    expect((await daily(f.token, "daily_build")).progress).toBe(1);
    expect((await (await intent(server, f.token, { type: "train", troop: "infantry", count: 7 })).json()).ok).toBe(true);
    expect((await daily(f.token, "daily_train")).progress).toBe(7);
  });

  test("an NPC victory counts once, even if the report is delivered again", async () => {
    const f = await fighter(server);
    const { report } = await winBattle(server, f);
    expect(report.result).toBe("victory");
    await server.fireAlarm(f.server);
    expect((await daily(f.token, "daily_fight")).progress).toBe(1);
    const rows = await sql<{ n: number }>(server, "SELECT COUNT(*) AS n FROM mission_ticks WHERE account_id = ? AND source = ?", f.id, `report:${report.id}`);
    expect(rows[0]!.n).toBe(1);
  });

  test("giving help counts", async () => {
    const leader = await allianceMember(server);
    const helper = await allianceMember(server);
    const a = await createAlliance(server, leader);
    await join(server, helper, a.alliance.id);
    await editBase(server, leader.id, (s) => {
      s.training = { troop: "infantry", count: 20, startedAt: server.now, endsAt: server.now + HOUR };
    });
    const req = await post(server, leader.token, "/v1/help/request", { kind: "training" });
    expect((await post(server, helper.token, "/v1/help/give", { requestId: req.request.id })).ok).toBe(true);
    expect((await daily(helper.token, "daily_help")).progress).toBe(1);
    expect((await daily(leader.token, "daily_help")).progress).toBe(0);
  });

  test("a done mission pays once, with its pass XP; not done and unknown are refused", async () => {
    const f = await fighter(server);
    expect(await post(server, f.token, "/v1/missions/claim", { mission: "daily_build" })).toMatchObject({ ok: false, reason: "not_done" });
    expect(await post(server, f.token, "/v1/missions/claim", { mission: "nope" })).toMatchObject({ ok: false, reason: "unknown_mission" });
    await seedTicks(f.id, "upgrades_started", 2);
    const before = await getState(server, f.token);
    const r = await post(server, f.token, "/v1/missions/claim", { mission: "daily_build" });
    expect(r).toMatchObject({ ok: true, passXp: DAILY_MISSIONS.daily_build.passXp });
    const cap = storageCap(before.levels.hq).funds;
    expect(r.state.resources.funds).toBe(Math.min(cap, Math.max(before.resources.funds, before.resources.funds + DAILY_MISSIONS.daily_build.reward.resources!.funds!)));
    expect(await post(server, f.token, "/v1/missions/claim", { mission: "daily_build" })).toMatchObject({ ok: false, reason: "already_claimed" });
    expect((await daily(f.token, "daily_build")).claimed).toBe(true);
    expect((await get(server, f.token, "/v1/pass")).xp).toBe(DAILY_MISSIONS.daily_build.passXp);
    expect(passSeasonAt(server.now).index).toBeGreaterThanOrEqual(0);
    for (const bad of [{}, { mission: 5 }, { mission: "x".repeat(65) }]) {
      expect((await server.request("POST", "/v1/missions/claim", { token: f.token, body: bad })).status).toBe(400);
    }
  });

  test("a token mission pays into the wallet", async () => {
    const f = await fighter(server);
    await seedTicks(f.id, "helps_given", 3);
    expect((await post(server, f.token, "/v1/missions/claim", { mission: "daily_help" })).ok).toBe(true);
    expect((await get(server, f.token, "/v1/store")).wallet.speedupTokens).toBe(DAILY_MISSIONS.daily_help.reward.speedupTokens);
  });

  test("the next day starts from zero and can be claimed again", async () => {
    const f = await fighter(server);
    await seedTicks(f.id, "upgrades_started", 2);
    expect((await post(server, f.token, "/v1/missions/claim", { mission: "daily_build" })).ok).toBe(true);
    server.now = missionDayStart(today() + 1, "algeria");
    expect(await daily(f.token, "daily_build")).toMatchObject({ progress: 0, claimed: false });
    await seedTicks(f.id, "upgrades_started", 2);
    expect((await post(server, f.token, "/v1/missions/claim", { mission: "daily_build" })).ok).toBe(true);
  });
});

describe("beginner quests", () => {
  test("the chain starts at the first quest and is claimed in order", async () => {
    const f = await fighter(server);
    expect((await get(server, f.token, "/v1/missions")).quest).toMatchObject({ id: QUEST_IDS[0], goal: QUESTS.first_farm.goal, step: 1, steps: QUEST_IDS.length, done: false });
    expect(await post(server, f.token, "/v1/quests/claim", { quest: "first_farm" })).toMatchObject({ ok: false, reason: "not_done" });
    await editBase(server, f.id, (s) => {
      s.levels.farm = 2;
      s.levels.armory = 2;
    });
    expect(await post(server, f.token, "/v1/quests/claim", { quest: "first_armory" })).toMatchObject({ ok: false, reason: "not_current" });
    expect((await post(server, f.token, "/v1/quests/claim", { quest: "first_farm" })).ok).toBe(true);
    expect(await post(server, f.token, "/v1/quests/claim", { quest: "first_farm" })).toMatchObject({ ok: false, reason: "already_claimed" });
    expect((await get(server, f.token, "/v1/missions")).quest).toMatchObject({ id: "first_armory", done: true, step: 2 });
    expect((await post(server, f.token, "/v1/quests/claim", { quest: "first_armory" })).ok).toBe(true);
  });

  test("the alliance quest reads membership", async () => {
    const p = await allianceMember(server);
    for (const id of QUEST_IDS.slice(0, QUEST_IDS.indexOf("first_alliance"))) {
      await server.env.DB.prepare("INSERT INTO claims (account_id, key, granted, at) VALUES (?, ?, 1, ?)").bind(p.id, `quest:${id}`, server.now).run();
    }
    expect(await post(server, p.token, "/v1/quests/claim", { quest: "first_alliance" })).toMatchObject({ ok: false, reason: "not_done" });
    await createAlliance(server, p);
    expect((await post(server, p.token, "/v1/quests/claim", { quest: "first_alliance" })).ok).toBe(true);
    expect((await get(server, p.token, "/v1/store")).wallet.speedupTokens).toBe(QUESTS.first_alliance.reward.speedupTokens);
  });

  test("the finished chain shows no quest, and quest claims survive the live prune", async () => {
    const f = await fighter(server);
    for (const id of QUEST_IDS) {
      await server.env.DB.prepare("INSERT INTO claims (account_id, key, granted, at) VALUES (?, ?, 1, ?)").bind(f.id, `quest:${id}`, 0).run();
    }
    expect((await get(server, f.token, "/v1/missions")).quest).toBeNull();
    const { pruneLive } = await import("../src/db/live-prune.ts");
    await pruneLive(server.env.DB, server.now);
    expect((await get(server, f.token, "/v1/missions")).quest).toBeNull();
  });
});
