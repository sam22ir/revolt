import { aidPlan, DAY_MS, LABOR_MS, LABOR_TROOPS, PROTECTION_RADIUS, TRUST_PER_HELP, type MapSnapshot, type MapVillageView, type NeedKind } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startServer, type Server } from "./harness.ts";
import { fighter, get, type Fighter } from "./live-helpers.ts";
import { editBase, getMap, getState, intent, march } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer({ GUEST_LIMIT_PER_HOUR: "100000" });
});
afterEach(() => server.dispose());

const aid = async (f: Fighter, village: string, troops: Record<string, number>) => (await intent(server, f.token, { type: "aid", village, troops })).json() as Promise<Record<string, any>>;

/** Moves the clock a day at a time until some village needs `need`; returns it with the snapshot. */
const findNeed = async (f: Fighter, need: NeedKind, accept: (v: MapVillageView, snap: MapSnapshot) => boolean = () => true): Promise<{ v: MapVillageView; snap: MapSnapshot }> => {
  for (let i = 0; i < 60; i++) {
    const snap = await getMap(server, f.token);
    const v = (snap.villages ?? []).find((x) => x.need === need && accept(x, snap));
    if (v !== undefined) return { v, snap };
    server.now += DAY_MS;
  }
  throw new Error(`no village needs ${need}`);
};

const stock = async (f: Fighter) => {
  await editBase(server, f.id, (s) => {
    s.troops = { infantry: 200, scouts: 0, heavy: 0, porters: 60 };
    s.resources = { food: 5000, materiel: 5000, funds: 5000, support: 0 };
  });
};

/** Lets the march arrive and the map settle. */
const arrive = async (f: Fighter, m: { arriveAt: number }) => {
  server.now = m.arriveAt;
  await server.fireAlarm(f.server);
};

describe("villages on the map", () => {
  test("the snapshot lists villages with today's need, the same for everyone", async () => {
    const a = await fighter(server);
    const b = await fighter(server);
    const va = (await getMap(server, a.token)).villages ?? [];
    const vb = (await getMap(server, b.token)).villages ?? [];
    expect(va.length).toBeGreaterThan(10);
    expect(vb).toEqual(va);
  });
});

describe("aid marches", () => {
  test("a delivery is paid now, credits trust on arrival, and comes home whole", async () => {
    const f = await fighter(server);
    await stock(f);
    const { v } = await findNeed(f, "food");
    const before = await getState(server, f.token);
    const r = await aid(f, v.id, { infantry: 5, porters: 10 });
    expect(r.ok).toBe(true);
    const m = r.state.marches.at(-1);
    expect(m.aid).toMatchObject({ village: v.id, need: "food", day: v.day });
    expect(r.state.resources.food).toBeLessThan(before.resources.food - aidPlan("food", 0).cost.food + 50);
    expect(await aid(f, v.id, { infantry: 5, porters: 10 })).toMatchObject({ ok: false, reason: "already_on_the_way" });
    await arrive(f, m);
    const s = await getState(server, f.token);
    expect(s.villages[v.id]).toMatchObject({ helpedDay: v.day });
    expect(s.villages[v.id].trust).toBeCloseTo(TRUST_PER_HELP, 0);
    expect((await get(server, f.token, "/v1/reports")).reports).toEqual([]);
    server.now = m.returnAt;
    const home = await getState(server, f.token);
    expect(home.troops).toMatchObject({ infantry: 200, porters: 60 });
    expect(await aid(f, v.id, { infantry: 5, porters: 10 })).toMatchObject({ ok: false, reason: "already_helped_today" });
  });

  test("labor keeps the troops at the village for a while", async () => {
    const f = await fighter(server);
    await stock(f);
    const { v } = await findNeed(f, "labor");
    expect(await aid(f, v.id, { infantry: LABOR_TROOPS - 1 })).toMatchObject({ ok: false, reason: "labor_troops" });
    const r = await aid(f, v.id, { infantry: LABOR_TROOPS });
    const m = r.state.marches.at(-1);
    expect(m.returnAt - m.arriveAt).toBe(m.arriveAt - m.departAt + LABOR_MS);
  });

  test("protection is not an aid march; beating a target nearby answers it", async () => {
    const f = await fighter(server);
    await stock(f);
    const { v, snap } = await findNeed(f, "protection", (x, s) => s.npcs.some((n) => n.level === 1 && Math.max(Math.abs(n.x - x.x), Math.abs(n.y - x.y)) <= PROTECTION_RADIUS));
    expect(await aid(f, v.id, { infantry: 10 })).toMatchObject({ ok: false, reason: "not_this_need" });
    const npc = snap.npcs.find((n) => n.level === 1 && Math.max(Math.abs(n.x - v.x), Math.abs(n.y - v.y)) <= PROTECTION_RADIUS)!;
    const r = await march(server, f.token, npc.id, { infantry: 60 });
    expect(r.ok).toBe(true);
    const m = r.state.marches.at(-1);
    await arrive(f, m);
    expect((await getState(server, f.token)).villages[v.id]).toMatchObject({ helpedDay: v.day });
  });

  test("an unknown village, too few porters, and bad input are refused", async () => {
    const f = await fighter(server);
    await stock(f);
    expect(await aid(f, "village:9999", { infantry: 5 })).toMatchObject({ ok: false, reason: "no_such_village" });
    const { v } = await findNeed(f, "funds");
    expect(await aid(f, v.id, { infantry: 1 })).toMatchObject({ ok: false, reason: "not_enough_carry" });
    for (const bad of [{ type: "aid" }, { type: "aid", village: v.id }, { type: "aid", village: 5, troops: { infantry: 1 } }]) {
      expect((await intent(server, f.token, bad)).status).toBe(400);
    }
  });
});
