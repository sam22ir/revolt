import { handle } from "./app.ts";
import type { Env } from "./env.ts";
import { productionDeps as deps } from "./production-deps.ts";
import { scheduled } from "./scheduled.ts";

export { AllianceRoom } from "./alliance/alliance-room.ts";
export { WorldMap } from "./map/world-map.ts";

export default {
  fetch: (req: Request, env: Env): Promise<Response> => handle(req, env, deps),
  scheduled: (controller: { readonly scheduledTime: number }, env: Env): Promise<void> => scheduled(controller.scheduledTime, env, deps),
};
