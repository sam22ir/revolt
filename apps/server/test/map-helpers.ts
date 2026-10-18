import { tileDistance, type MapNpcView, type MapSnapshot } from "@revolt/rules";
import { body, newGuest, type Device, type Json, type Server } from "./harness.ts";

export const getMap = async (server: Server, token: string): Promise<MapSnapshot> => body(await server.request("GET", "/v1/map", { token }));

export const getState = async (server: Server, token: string): Promise<Json> => (await body(await server.request("GET", "/v1/state", { token }))).state;

export const intent = (server: Server, token: string, b: unknown): Promise<Response> => server.request("POST", "/v1/intent", { token, body: b });

export const march = async (server: Server, token: string, target: string, troops: unknown): Promise<Json> =>
  body(await intent(server, token, { type: "march", target, troops }));

/** The nearest live NPC of `level` to the player's base. */
export const nearestNpc = (snap: MapSnapshot, level = 1): MapNpcView => {
  const mine = snap.bases.find((b) => b.mine);
  if (mine === undefined) throw new Error("no base");
  const npcs = snap.npcs.filter((n) => n.level === level).sort((a, b) => tileDistance(mine, a) - tileDistance(mine, b));
  const npc = npcs[0];
  if (npc === undefined) throw new Error(`no level ${level} npc`);
  return npc;
};

/** A guest with a placed base and the nearest level-1 target. */
export const player = async (server: Server): Promise<Device & { res: Json; npc: MapNpcView; snap: MapSnapshot }> => {
  const d = await newGuest(server);
  const snap = await getMap(server, d.token);
  return { ...d, snap, npc: nearestNpc(snap) };
};
