import {
  createBaseState,
  fightNpc,
  heroBattleModifier,
  NO_BATTLE_MODIFIER,
  ZERO_TROOPS,
  type BattleReport,
  type HeroId,
  type HeroLoadout,
} from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadBase, saveBase } from "../src/db/bases.ts";
import { body, newGuest, startServer, T0, type Json, type Server } from "./harness.ts";
import { getMap, getState, intent, nearestNpc } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer();
});
afterEach(() => server.dispose());

/** A save whose roster owns the given heroes at the given levels. */
const withHeroes = (owned: Partial<Record<HeroId, number>>) => ({
  ...createBaseState(T0),
  heroes: { pity: 0, owned: Object.fromEntries(Object.entries(owned).map(([id, level]) => [id, { level, shards: 0 }])) },
});

/**
 * A guest whose base owns the given heroes. Clients cannot import a roster (see importM1Save), so the test
 * writes the base straight into the database, as the rules would have left it after recruiting.
 */
const heroPlayer = async (owned: Partial<Record<HeroId, number>>) => {
  const d = await newGuest(server);
  const accountId = d.res.account.id as string;
  const stored = await loadBase(server.env.DB, accountId);
  if (stored === null) throw new Error("no base");
  const army = { infantry: 40, scouts: 10, heavy: 5, porters: 0 };
  await saveBase(server.env.DB, accountId, { ...stored.state, heroes: withHeroes(owned).heroes, troops: army }, stored.version, T0);
  const snap = await getMap(server, d.token);
  return { token: d.token, npc: nearestNpc(snap) };
};

const send = async (token: string, target: string, troops: Json, heroes?: HeroLoadout | null): Promise<Json> =>
  body(await intent(server, token, { type: "march", target, troops, ...(heroes === undefined ? {} : { heroes }) }));

const reports = async (token: string): Promise<BattleReport[]> => (await body(await server.request("GET", "/v1/reports", { token }))).reports;

const commander = { lead: "hill_commander", deputies: ["dock_foreman"] } as const;

describe("march with heroes: recording the loadout", () => {
  test("the base and the march record the lead, the deputies and the levels they left with", async () => {
    const p = await heroPlayer({ hill_commander: 3, dock_foreman: 2 });
    const r = await send(p.token, p.npc.id, { infantry: 10 }, { ...commander, deputies: [...commander.deputies] });
    expect(r.ok).toBe(true);
    expect(r.state.marches[0].heroes).toEqual({ lead: "hill_commander", deputies: ["dock_foreman"], levels: { hill_commander: 3, dock_foreman: 2 } });
    expect((await getState(server, p.token)).marches[0].heroes).toEqual(r.state.marches[0].heroes);
  });

  test("a march without heroes records none, and a null loadout is the same as none", async () => {
    const p = await heroPlayer({ hill_commander: 1 });
    const plain = await send(p.token, p.npc.id, { infantry: 5 });
    expect(plain.state.marches[0]).not.toHaveProperty("heroes");
    const withNull = await send(p.token, p.npc.id, { infantry: 5 }, null);
    expect(withNull.state.marches[1]).not.toHaveProperty("heroes");
  });

  test("a malformed loadout is a bad request, and spends nothing", async () => {
    const p = await heroPlayer({ hill_commander: 1, dock_foreman: 1, mountain_guide: 1 });
    const bad: unknown[] = [
      { lead: "nobody" },
      { lead: "hill_commander", deputies: ["dock_foreman", "mountain_guide", "hill_commander"] },
      { lead: "hill_commander", deputies: "dock_foreman" },
      "hill_commander",
      5,
    ];
    for (const heroes of bad) {
      const res = await intent(server, p.token, { type: "march", target: p.npc.id, troops: { infantry: 5 }, heroes });
      expect(res.status, JSON.stringify(heroes)).toBe(400);
    }
    expect((await getMap(server, p.token)).marches).toEqual([]);
  });
});

describe("march with heroes: refusals", () => {
  test("a hero already out on a march cannot join a second one, as lead or deputy", async () => {
    const p = await heroPlayer({ hill_commander: 1, dock_foreman: 1, mountain_guide: 1 });
    expect((await send(p.token, p.npc.id, { infantry: 5 }, commander)).ok).toBe(true);
    const troopsBefore = (await getState(server, p.token)).troops;
    expect(await send(p.token, p.npc.id, { infantry: 5 }, { lead: "hill_commander", deputies: [] })).toMatchObject({ ok: false, reason: "hero_busy" });
    expect(await send(p.token, p.npc.id, { infantry: 5 }, { lead: "mountain_guide", deputies: ["dock_foreman"] })).toMatchObject({ ok: false, reason: "hero_busy" });
    expect((await getState(server, p.token)).troops).toEqual(troopsBefore);
    expect((await getMap(server, p.token)).marches).toHaveLength(1);
  });

  test("a hero not owned, or listed twice, is refused with its reason", async () => {
    const p = await heroPlayer({ hill_commander: 1 });
    expect(await send(p.token, p.npc.id, { infantry: 5 }, { lead: "hill_commander", deputies: ["mountain_guide"] })).toMatchObject({ ok: false, reason: "not_owned" });
    expect(await send(p.token, p.npc.id, { infantry: 5 }, { lead: "hill_commander", deputies: ["hill_commander"] })).toMatchObject({ ok: false, reason: "duplicate_hero" });
    expect((await getMap(server, p.token)).marches).toEqual([]);
  });

  test("a hero stays locked while the march is back at base's waiting, and is free again once it returns", async () => {
    const p = await heroPlayer({ hill_commander: 1, dock_foreman: 1 });
    const r = await send(p.token, p.npc.id, { infantry: 10 }, commander);
    const m = r.state.marches[0];
    server.now = m.arriveAt;
    await server.fireAlarm();
    // The first target is beaten on arrival, so later sends go to another live NPC.
    const other = (await getMap(server, p.token)).npcs.find((n) => n.level === 1)!;
    expect(await send(p.token, other.id, { infantry: 1 }, { lead: "hill_commander", deputies: [] })).toMatchObject({ ok: false, reason: "hero_busy" });
    server.now = m.returnAt;
    await server.fireAlarm();
    const again = await send(p.token, other.id, { infantry: 1 }, { lead: "hill_commander", deputies: ["dock_foreman"] });
    expect(again.ok).toBe(true);
    expect(again.state.marches).toHaveLength(1);
  });
});

describe("march with heroes: the battle on arrival", () => {
  test("the report names the heroes, and the outcome is the rules' fight with their modifier and the report's seed", async () => {
    const p = await heroPlayer({ hill_commander: 4, dock_foreman: 2 });
    const r = await send(p.token, p.npc.id, { infantry: 12 }, commander);
    const m = r.state.marches[0];
    server.now = m.arriveAt;
    await server.fireAlarm();

    const [report] = await reports(p.token);
    if (report === undefined || report.seed === null) throw new Error("no report with a seed");
    expect(report.heroes).toEqual(["hill_commander", "dock_foreman"]);
    const expected = fightNpc({ ...ZERO_TROOPS, infantry: 12 }, 1, report.seed, heroBattleModifier(m.heroes));
    expect(report.result).toBe(expected.outcome.result);
    expect(report.survivors).toEqual(expected.outcome.survivors);
    expect(report.rounds).toBe(expected.battle?.rounds.length);
    expect((await getState(server, p.token)).marches[0].outcome).toEqual(expected.outcome);
  });

  test("a battle with heroes is the same on replay from the same seed", async () => {
    const p = await heroPlayer({ hill_commander: 2, dock_foreman: 1 });
    await send(p.token, p.npc.id, { infantry: 8, scouts: 3 }, commander);
    const m = (await getState(server, p.token)).marches[0];
    server.now = m.arriveAt;
    await server.fireAlarm();
    const [report] = await reports(p.token);
    const first = fightNpc({ ...ZERO_TROOPS, infantry: 8, scouts: 3 }, 1, report!.seed!, heroBattleModifier(m.heroes));
    const replay = fightNpc({ ...ZERO_TROOPS, infantry: 8, scouts: 3 }, 1, report!.seed!, heroBattleModifier(m.heroes));
    expect(replay).toEqual(first);
    expect(report!.rounds).toBe(first.battle?.rounds.length);
  });

  test("a march without heroes fights with no modifier and its report has no heroes field", async () => {
    const p = await heroPlayer({ hill_commander: 4 });
    const r = await send(p.token, p.npc.id, { infantry: 12 });
    const m = r.state.marches[0];
    server.now = m.arriveAt;
    await server.fireAlarm();
    const [report] = await reports(p.token);
    if (report === undefined || report.seed === null) throw new Error("no report with a seed");
    expect(report).not.toHaveProperty("heroes");
    const expected = fightNpc({ ...ZERO_TROOPS, infantry: 12 }, 1, report.seed, NO_BATTLE_MODIFIER);
    expect(report.result).toBe(expected.outcome.result);
    expect(report.survivors).toEqual(expected.outcome.survivors);
  });
});
