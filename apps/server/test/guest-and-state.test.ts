import { advance, createBaseState, M1_IMPORT_MAX_LEVEL, START_TROOPS, startUpgrade, storageCap, ZERO_TROOPS } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { body, DAY, HOUR, newGuest, startServer, T0, type Server } from "./harness.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer();
});
afterEach(() => server.dispose());

describe("guest accounts", () => {
  test("a new device gets a guest account, a token and a fresh base at server time", async () => {
    const res = await server.request("POST", "/v1/guest");
    expect(res.status).toBe(201);
    const b = await body(res);
    expect(b.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b.account.google).toBeNull();
    expect(b.state).toEqual(createBaseState(T0));
    expect(b.now).toBe(T0);
    expect(b.imported).toBe(false);
  });

  test("the token reloads the same base", async () => {
    const a = await newGuest(server);
    const b = await body(await server.request("GET", "/v1/state", { token: a.token }));
    expect(b.account.id).toBe(a.res.account.id);
    expect(b.state).toEqual(createBaseState(T0));
  });

  test("two guests are separate accounts", async () => {
    const a = await newGuest(server);
    const b = await newGuest(server);
    expect(a.res.account.id).not.toBe(b.res.account.id);
    expect(a.token).not.toBe(b.token);
  });

  test("missing, malformed or unknown tokens are rejected", async () => {
    expect((await server.request("GET", "/v1/state")).status).toBe(401);
    expect((await server.request("GET", "/v1/state", { token: "short" })).status).toBe(401);
    expect((await server.request("GET", "/v1/state", { token: "x".repeat(43) })).status).toBe(401);
  });
});

describe("the server computes resources and timers", () => {
  test("resources accrue with server time", async () => {
    const a = await newGuest(server);
    server.now = T0 + HOUR;
    const b = await body(await server.request("GET", "/v1/state", { token: a.token }));
    expect(b.state).toEqual(advance(createBaseState(T0), T0 + HOUR));
    expect(b.now).toBe(T0 + HOUR);
  });

  test("a very long offline gap stops at the storage cap", async () => {
    const a = await newGuest(server);
    server.now = T0 + 365 * DAY;
    const b = await body(await server.request("GET", "/v1/state", { token: a.token }));
    expect(b.state.resources).toEqual(storageCap(1));
  });

  test("the server clock going backwards never loses production", async () => {
    const a = await newGuest(server);
    server.now = T0 + HOUR;
    await server.request("POST", "/v1/intent", { token: a.token, body: { type: "upgrade", building: "hq" } });
    server.now = T0 - DAY;
    const b = await body(await server.request("GET", "/v1/state", { token: a.token }));
    const expected = startUpgrade(createBaseState(T0), "hq", T0 + HOUR);
    if (!expected.ok) throw new Error(expected.reason);
    expect(b.state).toEqual(expected.state);
  });

  test("an upgrade completes at server time, read lazily", async () => {
    const a = await newGuest(server);
    const r = await body(await server.request("POST", "/v1/intent", { token: a.token, body: { type: "upgrade", building: "hq" } }));
    expect(r.ok).toBe(true);
    server.now = r.state.queue.endsAt - 1;
    expect((await body(await server.request("GET", "/v1/state", { token: a.token }))).state.levels.hq).toBe(1);
    server.now = r.state.queue.endsAt;
    const done = await body(await server.request("GET", "/v1/state", { token: a.token }));
    expect(done.state.levels.hq).toBe(2);
    expect(done.state.queue).toBeNull();
  });
});

describe("M1 save import", () => {
  const forged = {
    resources: { food: 1e12, materiel: 1e12, funds: 1e12, support: 1e12 },
    levels: { hq: 10, farm: 10, armory: 10, treasury: 10 },
    queue: null,
    lastUpdated: T0 - DAY,
  };

  test("a plausible local save becomes the guest's base", async () => {
    const r = startUpgrade(createBaseState(T0 - HOUR), "hq", T0 - HOUR);
    if (!r.ok) throw new Error(r.reason);
    const a = await newGuest(server, r.state);
    expect(a.res.imported).toBe(true);
    expect(a.res.state).toEqual(r.state);
  });

  test("a forged save is bounded", async () => {
    const a = await newGuest(server, forged);
    expect(a.res.state.levels).toEqual({ hq: M1_IMPORT_MAX_LEVEL, farm: 3, armory: 3, treasury: 3, barracks: 1, hero_hall: 1 });
    expect(a.res.state.resources).toEqual(storageCap(M1_IMPORT_MAX_LEVEL));
  });

  test("a save can never bring troops, wounded, training or marches", async () => {
    const army = { infantry: 1_000_000, scouts: 1_000_000, heavy: 1_000_000, porters: 0 };
    const march = { id: "x", target: { npcId: "n", level: 1, x: 1, y: 1 }, from: { x: 0, y: 0 }, troops: army, departAt: T0, arriveAt: T0, returnAt: T0 + 1, outcome: null };
    const a = await newGuest(server, {
      ...forged,
      levels: { ...forged.levels, barracks: 10 },
      troops: army,
      wounded: army,
      training: { troop: "heavy", count: 1_000_000, startedAt: T0 - DAY, endsAt: T0 - DAY + 1 },
      marches: [march],
    });
    expect(a.res.imported).toBe(true);
    expect(a.res.state).toMatchObject({ troops: START_TROOPS, wounded: ZERO_TROOPS, training: null, marches: [] });
    expect(a.res.state.levels.barracks).toBe(M1_IMPORT_MAX_LEVEL);
  });

  test("clearing the session and importing again only ever yields another bounded base", async () => {
    const first = await newGuest(server, forged);
    const second = await newGuest(server, forged);
    expect(second.res.account.id).not.toBe(first.res.account.id);
    expect(second.res.state.levels.hq).toBe(M1_IMPORT_MAX_LEVEL);
  });

  test("an invalid save gives a fresh base", async () => {
    const a = await newGuest(server, { levels: "lots" });
    expect(a.res.imported).toBe(false);
    expect(a.res.state).toEqual(createBaseState(T0));
  });

  test("an existing account cannot import: there is no import route for it", async () => {
    const a = await newGuest(server);
    const res = await server.request("POST", "/v1/state", { token: a.token, body: { importSave: forged } });
    expect(res.status).toBe(404);
    expect((await body(await server.request("GET", "/v1/state", { token: a.token }))).state).toEqual(createBaseState(T0));
  });
});

describe("http", () => {
  test("unknown routes are 404", async () => {
    expect((await server.request("GET", "/nope")).status).toBe(404);
  });

  test("CORS preflight is answered for allowed origins only", async () => {
    const ok = await server.request("OPTIONS", "/v1/intent", { origin: "http://localhost:4173" });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:4173");
    expect(ok.headers.get("access-control-allow-headers")).toContain("authorization");
    const other = await server.request("OPTIONS", "/v1/intent", { origin: "https://evil.example" });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});
