import { geographyOf, MAP_SIZE, ZONE_CLEARANCE, ZONE_SITES, zoneAt, zonesOf, MAX_NPC_LEVEL, NPC_COUNT_BY_LEVEL, NPC_LEVELS, regionAt, regionsOf } from "@revolt/rules";
import { test } from "vitest";
import { newGuest, type Server } from "./harness.ts";
import { getMap, march, player } from "./map-helpers.ts";
import { LONG, rows } from "./rows.ts";

test("map snapshot: placement, visibility, NPCs, strongholds, regions, no leaks", async () => {
  await rows({}, {
    "places a new player's base once, on the map": async (s, ex) => {
      const a = await newGuest(s);
      const first = await getMap(s, a.token);
      const mine = first.bases.filter((b) => b.mine);
      ex(mine).toHaveLength(1);
      ex(mine[0]!.x).toBeGreaterThanOrEqual(0);
      ex(mine[0]!.x).toBeLessThan(MAP_SIZE);
      ex((await getMap(s, a.token)).bases, "same place on the next read").toEqual(first.bases);
      ex(first).toMatchObject({ map: "algeria-1", size: MAP_SIZE, now: s.now });
    },
    "two accounts on one server see each other's bases, never each other's account ids": async (s, ex) => {
      const a = await newGuest(s);
      const b = await newGuest(s);
      await getMap(s, a.token);
      const seenByB = await getMap(s, b.token);
      const seenByA = await getMap(s, a.token);
      ex(seenByA.bases).toHaveLength(2);
      ex(seenByB.bases.map((x) => ({ ...x, mine: !x.mine }))).toEqual(seenByA.bases);
      const raw = JSON.stringify(seenByA);
      ex(raw).not.toContain(a.res.account.id);
      ex(raw).not.toContain(b.res.account.id);
      for (const base of seenByA.bases) ex(base.tag).toMatch(/^[A-Z2-9]{6}$/);
    },
    "NPC targets of every level exist, on free tiles": async (s, ex) => {
      const snap = await getMap(s, (await newGuest(s)).token);
      NPC_COUNT_BY_LEVEL.forEach((n, i) => ex(snap.npcs.filter((x) => x.level === i + 1 && x.region === null), `level ${i + 1}`).toHaveLength(n));
      // Level 4 is the fixed strongholds: exactly one per region, each inside its own region.
      const strongholds = snap.npcs.filter((x) => x.level === MAX_NPC_LEVEL);
      ex(strongholds.map((x) => x.region).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(regionsOf(snap.terrainSeed).map((r) => r.id));
      for (const x of strongholds) ex(regionAt(snap.terrainSeed, x.x, x.y), `stronghold ${x.id}`).toBe(x.region);
      for (const npc of snap.npcs) ex(npc.kind, `kind of ${npc.id}`).toBe(NPC_LEVELS[npc.level - 1]!.kind);
      const tiles = new Set([...snap.npcs, ...snap.bases].map((p) => `${p.x},${p.y}`));
      ex(tiles.size, "no two share a tile").toBe(snap.npcs.length + snap.bases.length);
    },
    "the first load carries the landmarks as the rules place them": async (s, ex) => {
      const snap = await getMap(s, (await newGuest(s)).token);
      const g = geographyOf(snap.terrainSeed, snap.size);
      const flat = (path: readonly { x: number; y: number }[]): number[] => path.flatMap((t) => [t.x, t.y]);
      ex(snap.geography).toEqual({ wadis: g.wadis.map(flat), roads: g.roads.map(flat), oases: flat(g.oases) });
    },
    "the map lists its contested zones, and each zone's rich sites name their zone": async (s, ex) => {
      const snap = await getMap(s, (await newGuest(s)).token);
      ex(snap.zones).toEqual(zonesOf(snap.terrainSeed, snap.size).map((z) => ({ id: z.id, x: z.x, y: z.y, radius: z.radius })));
      const inZones = (snap.sites ?? []).filter((x) => x.zone !== null);
      ex(inZones.length).toBe((snap.zones ?? []).length * ZONE_SITES);
      for (const site of inZones) ex(site.level, site.id).toBeGreaterThanOrEqual(4);
      for (const b of snap.bases) ex(zoneAt(snap.terrainSeed, b.x, b.y, snap.size, ZONE_CLEARANCE), `base ${b.tag}`).toBeNull();
    },
    "needs a valid session": async (s, ex) => {
      ex((await s.request("GET", "/v1/map")).status).toBe(401);
    },
    "never shows a march's battle seed before the battle": async (s, ex) => {
      const p = await player(s);
      await march(s, p.token, p.npc.id, { infantry: 5 });
      ex(JSON.stringify(await getMap(s, p.token))).not.toContain("seed");
    },
  });
}, LONG);

test("map websocket: refusals and live pushes", async () => {
  const ws = (s: Server, headers: Record<string, string>, token?: string): Promise<Response> =>
    s.request("GET", "/v1/map/ws", {
      headers: { upgrade: "websocket", ...(token === undefined ? {} : { "sec-websocket-protocol": `revolt.v1, auth.${token}` }), ...headers },
    });
  await rows({}, {
    "refuses plain requests, foreign origins and missing or bad tokens": async (s, ex) => {
      const a = await newGuest(s);
      ex((await s.request("GET", "/v1/map/ws", { token: a.token })).status, "plain request").toBe(426);
      ex((await ws(s, { origin: "https://evil.example" }, a.token)).status, "foreign origin").toBe(403);
      ex((await ws(s, {})).status, "no token").toBe(401);
      ex((await ws(s, {}, "y".repeat(43))).status, "unknown token").toBe(401);
      ex((await ws(s, { "sec-websocket-protocol": "revolt.v1, auth.bad token" })).status, "malformed token").toBe(401);
    },
    "a connected client gets the map, and hears when another player's base appears": async (s, ex) => {
      const a = await newGuest(s);
      const res = await ws(s, { origin: "http://localhost:4173" }, a.token);
      ex(res.status).toBe(200);
      const socket = s.map().sockets[0]!;
      ex(socket.received.at(-1)).toMatchObject({ type: "map", snapshot: { bases: [{ mine: true }] } });
      const b = await newGuest(s);
      await getMap(s, b.token);
      ex(socket.received.at(-1)).toMatchObject({ type: "map" });
      ex(socket.received.at(-1).snapshot.bases).toHaveLength(2);
      ex(socket.received.every((m: { snapshot?: object }) => m.snapshot === undefined || !("geography" in m.snapshot)), "the socket never sends landmarks").toBe(true);
    },
  });
}, LONG);
