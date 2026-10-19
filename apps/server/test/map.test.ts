import { MAP_SIZE, NPC_COUNT_BY_LEVEL, NPC_LEVELS } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { body, newGuest, startServer, type Server } from "./harness.ts";
import { getMap, march, player } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer();
});
afterEach(() => server.dispose());

describe("GET /v1/map", () => {
  test("places a new player's base once, on the map", async () => {
    const a = await newGuest(server);
    const first = await getMap(server, a.token);
    const mine = first.bases.filter((b) => b.mine);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.x).toBeGreaterThanOrEqual(0);
    expect(mine[0]!.x).toBeLessThan(MAP_SIZE);
    expect((await getMap(server, a.token)).bases).toEqual(first.bases);
    expect(first).toMatchObject({ map: "algeria-1", size: MAP_SIZE, now: server.now });
  });

  test("two accounts on one server see each other's bases, never each other's account ids", async () => {
    const a = await newGuest(server);
    const b = await newGuest(server);
    await getMap(server, a.token);
    const seenByB = await getMap(server, b.token);
    const seenByA = await getMap(server, a.token);
    expect(seenByA.bases).toHaveLength(2);
    expect(seenByB.bases.map((x) => ({ ...x, mine: !x.mine }))).toEqual(seenByA.bases);
    const raw = JSON.stringify(seenByA);
    expect(raw).not.toContain(a.res.account.id);
    expect(raw).not.toContain(b.res.account.id);
    for (const base of seenByA.bases) expect(base.tag).toMatch(/^[A-Z2-9]{6}$/);
  });

  test("NPC targets of every level exist, on free tiles", async () => {
    const snap = await getMap(server, (await newGuest(server)).token);
    NPC_COUNT_BY_LEVEL.forEach((n, i) => expect(snap.npcs.filter((x) => x.level === i + 1)).toHaveLength(n));
    for (const npc of snap.npcs) expect(npc.kind).toBe(NPC_LEVELS[npc.level - 1]!.kind);
    const tiles = new Set([...snap.npcs, ...snap.bases].map((p) => `${p.x},${p.y}`));
    expect(tiles.size).toBe(snap.npcs.length + snap.bases.length);
  });

  test("needs a valid session", async () => {
    expect((await server.request("GET", "/v1/map")).status).toBe(401);
  });

  test("never shows a march's battle seed before the battle", async () => {
    const p = await player(server);
    await march(server, p.token, p.npc.id, { infantry: 5 });
    const raw = JSON.stringify(await getMap(server, p.token));
    expect(raw).not.toContain("seed");
  });
});

describe("GET /v1/map/ws", () => {
  const ws = (headers: Record<string, string>, token?: string): Promise<Response> =>
    server.request("GET", "/v1/map/ws", {
      headers: { upgrade: "websocket", ...(token === undefined ? {} : { "sec-websocket-protocol": `revolt.v1, auth.${token}` }), ...headers },
    });

  test("refuses plain requests, foreign origins and missing or bad tokens", async () => {
    const a = await newGuest(server);
    expect((await server.request("GET", "/v1/map/ws", { token: a.token })).status).toBe(426);
    expect((await ws({ origin: "https://evil.example" }, a.token)).status).toBe(403);
    expect((await ws({})).status).toBe(401);
    expect((await ws({}, "y".repeat(43))).status).toBe(401);
    expect((await ws({ "sec-websocket-protocol": "revolt.v1, auth.bad token" })).status).toBe(401);
  });

  test("a connected client gets the map, and hears when another player's base appears", async () => {
    const a = await newGuest(server);
    const res = await ws({ origin: "http://localhost:4173" }, a.token);
    expect(res.status).toBe(200);
    const socket = server.map().sockets[0]!;
    expect(socket.received.at(-1)).toMatchObject({ type: "map", snapshot: { bases: [{ mine: true }] } });
    const b = await newGuest(server);
    await getMap(server, b.token);
    expect(socket.received.at(-1)).toMatchObject({ type: "map" });
    expect(socket.received.at(-1).snapshot.bases).toHaveLength(2);
  });
});

describe("GET /v1/reports", () => {
  test("starts empty and needs a session", async () => {
    const a = await newGuest(server);
    expect(await body(await server.request("GET", "/v1/reports", { token: a.token }))).toEqual({ reports: [], now: server.now });
    expect((await server.request("GET", "/v1/reports")).status).toBe(401);
  });
});
