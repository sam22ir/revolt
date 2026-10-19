import type { MapPoint, MapSnapshot, Troops } from "@revolt/rules";
import type { Env } from "../env.ts";
import type { HqResult, MapViewer, SendMarchResult } from "./map-service.ts";

export type { MapViewer } from "./map-service.ts";

/**
 * The RPC surface of the WorldMap Durable Object (src/map/world-map.ts), declared here so
 * code outside the DO needs no Workers runtime types (tests run in Node).
 */
export interface MapStub {
  view(map: string, viewer: MapViewer, now: number): Promise<MapSnapshot>;
  sendMarch(map: string, viewer: MapViewer, npcId: string, troops: Troops, now: number): Promise<SendMarchResult>;
  startRally(map: string, viewer: MapViewer, npcId: string, troops: Troops, gatherMs: number, now: number): Promise<SendMarchResult>;
  joinRally(map: string, viewer: MapViewer, rallyId: string, troops: Troops, now: number): Promise<SendMarchResult>;
  setHq(map: string, viewer: MapViewer, x: number, y: number, now: number): Promise<HqResult>;
  hqOf(map: string, allianceId: string): Promise<MapPoint | null>;
  setAlliance(map: string, viewer: MapViewer, now: number): Promise<void>;
  removeAlliance(map: string, allianceId: string, now: number): Promise<void>;
  removeAccounts(ids: string[], now: number): Promise<number>;
  fetch(req: Request): Promise<Response>;
}

/** The slice of `DurableObjectNamespace<WorldMap>` we use. */
export interface MapNamespace {
  idFromName(name: string): unknown;
  get(id: never): MapStub;
}

/** What the Worker asks of a server's map. */
export interface MapApi {
  view(viewer: MapViewer, now: number): Promise<MapSnapshot>;
  sendMarch(viewer: MapViewer, npcId: string, troops: Troops, now: number): Promise<SendMarchResult>;
  startRally(viewer: MapViewer, npcId: string, troops: Troops, gatherMs: number, now: number): Promise<SendMarchResult>;
  joinRally(viewer: MapViewer, rallyId: string, troops: Troops, now: number): Promise<SendMarchResult>;
  setHq(viewer: MapViewer, x: number, y: number, now: number): Promise<HqResult>;
  hqOf(allianceId: string): Promise<MapPoint | null>;
  /** Tells the map a player's name or alliance changed, so everyone's snapshot shows it. */
  setAlliance(viewer: MapViewer, now: number): Promise<void>;
  removeAlliance(allianceId: string, now: number): Promise<void>;
  removeAccounts(ids: string[], now: number): Promise<number>;
  /** Hands an authenticated WebSocket upgrade to the map. */
  connect(req: Request, viewer: MapViewer, now: number): Promise<Response>;
}

/** The map Durable Object for `server` (one per server map, by name). */
export const durableMap = (env: Env, server: string): MapApi => {
  const stub = env.WORLD_MAP.get(env.WORLD_MAP.idFromName(server) as never);
  return {
    view: (v, now) => stub.view(server, v, now),
    sendMarch: (v, npcId, troops, now) => stub.sendMarch(server, v, npcId, troops, now),
    startRally: (v, npcId, troops, gatherMs, now) => stub.startRally(server, v, npcId, troops, gatherMs, now),
    joinRally: (v, rallyId, troops, now) => stub.joinRally(server, v, rallyId, troops, now),
    setHq: (v, x, y, now) => stub.setHq(server, v, x, y, now),
    hqOf: (allianceId) => stub.hqOf(server, allianceId),
    setAlliance: (v, now) => stub.setAlliance(server, v, now),
    removeAlliance: (allianceId, now) => stub.removeAlliance(server, allianceId, now),
    removeAccounts: (ids, now) => stub.removeAccounts(ids, now),
    connect: (req, v, now) => {
      const headers = new Headers(req.headers);
      headers.set("x-account-id", v.accountId);
      headers.set("x-handle", v.handle);
      headers.set("x-alliance-id", v.allianceId ?? "");
      headers.set("x-alliance-tag", v.allianceTag ?? "");
      headers.set("x-map", server);
      headers.set("x-now", String(now));
      return stub.fetch(new Request(req.url, { headers }));
    },
  };
};
