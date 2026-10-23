import { createBaseState } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { body, newGuest, startServer, T0, type Device, type Server } from "./harness.ts";

let server: Server;
let device: Device;
beforeEach(async () => {
  server = await startServer();
  device = await newGuest(server);
});
afterEach(() => server.dispose());

const intent = (b: unknown, token = device.token): Promise<Response> => server.request("POST", "/v1/intent", { token, body: b });

describe("hero intents", () => {
  const hallTwo = (resources = { food: 0, materiel: 0, funds: 5000, support: 0 }) => ({
    ...createBaseState(T0),
    resources,
    levels: { hq: 3, farm: 1, armory: 1, treasury: 1, barracks: 1, hero_hall: 2 },
  });

  test("recruit is refused below the hero hall's minimum level, and changes nothing", async () => {
    const b = await body(await intent({ type: "recruit" }));
    expect(b).toMatchObject({ ok: false, reason: "hero_hall_level" });
    expect(await body(await server.request("GET", "/v1/state", { token: device.token }))).toMatchObject({ state: createBaseState(T0) });
  });

  test("recruit at hall level 2 draws a hero, charges the cost and saves the roster", async () => {
    const g = await newGuest(server, hallTwo());
    const b = await body(await server.request("POST", "/v1/intent", { token: g.token, body: { type: "recruit" } }));
    expect(b.ok).toBe(true);
    const draw = b.draw as { heroId: string; duplicate: boolean };
    expect(draw.duplicate).toBe(false);
    const saved = (await body(await server.request("GET", "/v1/state", { token: g.token }))).state as { heroes: { owned: Record<string, unknown> }; resources: { funds: number } };
    expect(saved.heroes.owned[draw.heroId]).toEqual({ level: 1, shards: 0 });
    expect(saved.resources.funds).toBeLessThan(5000);
  });

  test("hero_level on a hero not owned is refused with its reason", async () => {
    const g = await newGuest(server, hallTwo());
    const b = await body(await intent({ type: "hero_level", hero: "hill_commander" }, g.token));
    expect(b).toMatchObject({ ok: false, reason: "not_owned" });
  });

  test("an unknown hero id is a bad request", async () => {
    const r = await intent({ type: "hero_level", hero: "nobody" });
    expect(r.status).toBe(400);
  });
});
