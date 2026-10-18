import { createBaseState, startUpgrade } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { body, HOUR, newGuest, startServer, T0, type Device, type Server } from "./harness.ts";

let server: Server;
let device: Device;
beforeEach(async () => {
  server = await startServer();
  device = await newGuest(server);
});
afterEach(() => server.dispose());

const intent = (b: unknown, token = device.token): Promise<Response> => server.request("POST", "/v1/intent", { token, body: b });
const state = async (): Promise<unknown> => (await body(await server.request("GET", "/v1/state", { token: device.token }))).state;

describe("upgrade intent", () => {
  test("is validated with the shared rules at server time and saved", async () => {
    server.now = T0 + HOUR;
    const b = await body(await intent({ type: "upgrade", building: "hq" }));
    const expected = startUpgrade(createBaseState(T0), "hq", T0 + HOUR);
    if (!expected.ok) throw new Error(expected.reason);
    expect(b).toEqual({ ok: true, state: expected.state, now: T0 + HOUR });
    expect(await state()).toEqual(expected.state);
  });

  test("a rule rejection returns the reason and changes nothing", async () => {
    const b = await body(await intent({ type: "upgrade", building: "farm" }));
    expect(b.ok).toBe(false);
    expect(b.reason).toBe("hq_gate");
    expect(await state()).toEqual(createBaseState(T0));
  });

  test("a second upgrade while one runs is refused", async () => {
    await intent({ type: "upgrade", building: "hq" });
    const b = await body(await intent({ type: "upgrade", building: "hq" }));
    expect(b).toMatchObject({ ok: false, reason: "queue_busy" });
  });

  test("concurrent intents never both succeed", async () => {
    const results = await Promise.all([1, 2, 3].map(() => intent({ type: "upgrade", building: "hq" }).then(body)));
    expect(results.filter((r) => r.ok === true)).toHaveLength(1);
    const expected = startUpgrade(createBaseState(T0), "hq", T0);
    if (!expected.ok) throw new Error(expected.reason);
    expect(await state()).toEqual(expected.state);
  });
});

describe("tampered requests", () => {
  test("numbers sent by the client are ignored", async () => {
    const rich = { food: 1e9, materiel: 1e9, funds: 1e9, support: 1e9 };
    const b = await body(
      await intent({
        type: "upgrade",
        building: "hq",
        state: { ...createBaseState(T0), resources: rich, levels: { hq: 10, farm: 10, armory: 10, treasury: 10 } },
        resources: rich,
        cost: { food: 0, materiel: 0, funds: 0, support: 0 },
        durationMs: 1,
        now: T0 + 100 * HOUR,
      }),
    );
    const expected = startUpgrade(createBaseState(T0), "hq", T0);
    if (!expected.ok) throw new Error(expected.reason);
    expect(b.state).toEqual(expected.state);
  });

  test("an upgrade the base cannot pay for is refused even if the client claims to be rich", async () => {
    await intent({ type: "upgrade", building: "hq" });
    server.now = T0 + 61_000; // HQ 2 done; HQ 3 costs more than is left.
    const rich = { food: 1e9, materiel: 1e9, funds: 1e9, support: 1e9 };
    const b = await body(await intent({ type: "upgrade", building: "hq", resources: rich, state: { resources: rich } }));
    expect(b).toMatchObject({ ok: false, reason: "insufficient" });
    expect(b.state.levels.hq).toBe(2);
    expect(b.state.resources.food).toBeLessThan(500);
  });

  test("malformed intents are rejected with 400 and change nothing", async () => {
    const bad: unknown[] = [
      { type: "setResources", food: 1e9 },
      { type: "upgrade", building: "castle" },
      { type: "upgrade" },
      { type: "upgrade", building: ["hq"] },
      { type: "upgrade", building: "__proto__" },
    ];
    for (const b of bad) expect((await intent(b)).status).toBe(400);
    expect((await server.request("POST", "/v1/intent", { token: device.token, raw: "{not json" })).status).toBe(400);
    expect((await server.request("POST", "/v1/intent", { token: device.token, raw: "[1,2]" })).status).toBe(400);
    expect((await server.request("POST", "/v1/intent", { token: device.token, raw: "x".repeat(20_000) })).status).toBe(413);
    expect(await state()).toEqual(createBaseState(T0));
  });

  test("an intent without a valid token is rejected", async () => {
    expect((await server.request("POST", "/v1/intent", { body: { type: "upgrade", building: "hq" } })).status).toBe(401);
    expect((await intent({ type: "upgrade", building: "hq" }, "y".repeat(43))).status).toBe(401);
    expect(await state()).toEqual(createBaseState(T0));
  });

  test("one account's token cannot touch another account's base", async () => {
    const other = await newGuest(server);
    await intent({ type: "upgrade", building: "hq" }, other.token);
    expect(await state()).toEqual(createBaseState(T0));
  });
});
