import { handle } from "./app.ts";
import { googleRemoteKeys } from "./auth/google.ts";
import type { Deps, Env } from "./env.ts";
import { durableRoom } from "./alliance/room-client.ts";
import { durableMap } from "./map/map-client.ts";
import { scheduled } from "./scheduled.ts";

export { AllianceRoom } from "./alliance/alliance-room.ts";
export { WorldMap } from "./map/world-map.ts";

const deps: Deps = { now: () => Date.now(), googleKeys: googleRemoteKeys(), map: durableMap, room: durableRoom };

export default {
  fetch: (req: Request, env: Env): Promise<Response> => handle(req, env, deps),
  scheduled: (controller: { readonly scheduledTime: number }, env: Env): Promise<void> => scheduled(controller.scheduledTime, env, deps),
};
