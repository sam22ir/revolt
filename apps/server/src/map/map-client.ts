import type { MapSnapshot, Troops } from "@revolt/rules";
import type { Env } from "../env.ts";
import type { SendMarchResult } from "./map-service.ts";

/**
 * The RPC surface of the WorldMap Durable Object (src/map/world-map.ts), declared here so
 * code outside the DO needs no Workers runtime types (tests run in Node).
 */
export interface MapStub {
  view(map: string, accountId: string, now: number): Promise<MapSnapshot>;
  sendMarch(map: string, accountId: string, npcId: string, troops: Troops, now: number): Promise<SendMarchResult>;
  removeAccounts(ids: string[], now: number): Promise<number>;
  fetch(req: Request): Promise<Response>;
}

/** The slice of `DurableObjectNamespace<WorldMap>` we use. */
export interface MapNamespace {
  idFromName(name: string): unknown;
  get(id: never): MapStub;
}

/** What the Worker asks of a server's map. The Durable Object in production, an in-process host in tests. */
export interface MapApi {
  view(accountId: string, now: number): Promise<MapSnapshot>;
  sendMarch(accountId: string, npcId: string, troops: Troops, now: number): Promise<SendMarchResult>;
  removeAccounts(ids: string[], now: number): Promise<number>;
  /** Hands an authenticated WebSocket upgrade to the map. */
  connect(req: Request, accountId: string, now: number): Promise<Response>;
}

/** The map Durable Object for `server` (one per server map, by name). */
export const durableMap = (env: Env, server: string): MapApi => {
  const stub = env.WORLD_MAP.get(env.WORLD_MAP.idFromName(server) as never);
  return {
    view: (accountId, now) => stub.view(server, accountId, now),
    sendMarch: (accountId, npcId, troops, now) => stub.sendMarch(server, accountId, npcId, troops, now),
    removeAccounts: (ids, now) => stub.removeAccounts(ids, now),
    connect: (req, accountId, now) => {
      const headers = new Headers(req.headers);
      headers.set("x-account-id", accountId);
      headers.set("x-map", server);
      headers.set("x-now", String(now));
      return stub.fetch(new Request(req.url, { headers }));
    },
  };
};
