import { FORECAST_LOSSES_LEVEL, healingQuote, isBaseState, type Troops } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startServer, type Server } from "./harness.ts";
import { fighter, post } from "./live-helpers.ts";
import { editBase, getState, intent } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer({ GUEST_LIMIT_PER_HOUR: "100000" });
});
afterEach(() => server.dispose());

const troops = (infantry: number, scouts = 0): Troops => ({ infantry, scouts, heavy: 0, porters: 0 });
const heal = async (token: string) => (await intent(server, token, { type: "heal" })).json() as Promise<Record<string, any>>;

describe("infirmary", () => {
  test("a new base has both buildings at level 1 and nobody healing", async () => {
    const f = await fighter(server);
    const s = await getState(server, f.token);
    expect([s.levels.watchtower, s.levels.infirmary, s.healing]).toEqual([1, 1, null]);
    expect(isBaseState(s)).toBe(true);
  });

  test("heal takes the wounded into the infirmary and they come home ready", async () => {
    const f = await fighter(server);
    expect(await heal(f.token)).toMatchObject({ ok: false, reason: "no_wounded" });
    await editBase(server, f.id, (s) => {
      s.wounded = troops(6, 2);
      s.resources = { food: 3000, materiel: 3000, funds: 3000, support: 0 };
    });
    const before = await getState(server, f.token);
    const r = await heal(f.token);
    expect(r.ok).toBe(true);
    expect(r.state.wounded).toEqual(troops(0, 0));
    expect(r.state.healing.troops).toEqual(troops(6, 2));
    expect(await heal(f.token)).toMatchObject({ ok: false, reason: "infirmary_busy" });
    server.now += healingQuote(troops(6, 2)).durationMs;
    const after = await getState(server, f.token);
    expect(after.healing).toBeNull();
    expect(after.troops.infantry).toBe(before.troops.infantry + 6);
    expect(after.troops.scouts).toBe(before.troops.scouts + 2);
  });

  test("a base stored before the two buildings existed still loads", async () => {
    const f = await fighter(server);
    await editBase(server, f.id, (s) => {
      delete s.levels.watchtower;
      delete s.levels.infirmary;
      delete s.healing;
    });
    const s = await getState(server, f.token);
    expect([s.levels.watchtower, s.levels.infirmary, s.healing]).toEqual([1, 1, null]);
  });

  test("the infirmary upgrades like any building", async () => {
    const f = await fighter(server);
    await editBase(server, f.id, (s) => {
      s.levels.hq = 3;
      s.resources = { food: 3000, materiel: 3000, funds: 3000, support: 0 };
    });
    const r = await (await intent(server, f.token, { type: "upgrade", building: "infirmary" })).json() as Record<string, any>;
    expect(r).toMatchObject({ ok: true, state: { queue: { building: "infirmary", toLevel: 2 } } });
  });
});

describe("watchtower forecast", () => {
  test("level 1 gives a verdict only; a higher tower adds the losses", async () => {
    const f = await fighter(server);
    const low = await post(server, f.token, "/v1/scout", { level: 1, troops: troops(200) });
    expect(low).toMatchObject({ watchtower: 1, forecast: { verdict: "likely_victory", lost: null, chance: null, nextLevel: FORECAST_LOSSES_LEVEL } });
    expect((await post(server, f.token, "/v1/scout", { level: 3, troops: troops(1) })).forecast.verdict).toBe("likely_defeat");
    await editBase(server, f.id, (s) => {
      s.levels.watchtower = FORECAST_LOSSES_LEVEL;
    });
    const high = await post(server, f.token, "/v1/scout", { level: 2, troops: troops(20, 10) });
    expect(typeof high.forecast.lost).toBe("number");
    expect(high.watchtower).toBe(FORECAST_LOSSES_LEVEL);
  });

  test("an unknown level or an empty march gives no forecast; bad input and heroes not owned are refused", async () => {
    const f = await fighter(server);
    expect((await post(server, f.token, "/v1/scout", { level: 99, troops: troops(5) })).forecast).toBeNull();
    expect((await post(server, f.token, "/v1/scout", { level: 1, troops: troops(0) })).forecast).toBeNull();
    for (const bad of [{}, { level: "1", troops: troops(1) }, { level: 1.5, troops: troops(1) }, { level: 1, troops: { infantry: -1 } }, { level: 1, troops: troops(1), heroes: 5 }]) {
      expect((await server.request("POST", "/v1/scout", { token: f.token, body: bad })).status).toBe(400);
    }
    expect(await post(server, f.token, "/v1/scout", { level: 1, troops: troops(5), heroes: { lead: "mountain_guide", deputies: [] } })).toMatchObject({ ok: false, reason: "not_owned" });
  });
});
