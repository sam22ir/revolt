import type { Deps, Env } from "./env.ts";
import { errorResponse, HttpError, withCors } from "./http.ts";
import type { Ctx } from "./handlers/context.ts";
import { postGoogle } from "./handlers/google.ts";
import { createGuest } from "./handlers/guest.ts";
import { postIntent } from "./handlers/intent.ts";
import { postLogout } from "./handlers/logout.ts";
import {
  connectAlliance,
  getAlliance,
  getAlliances,
  postCreateAlliance,
  postDemote,
  postHq,
  postJoinAlliance,
  postKick,
  postLeaveAlliance,
  postPromote,
  postTransfer,
} from "./handlers/alliance.ts";
import { postHelpGive, postHelpRequest } from "./handlers/help.ts";
import { connectMap, getMap, getReports } from "./handlers/map.ts";
import { getState } from "./handlers/state.ts";
import { getEvents, postEventClaim } from "./handlers/events.ts";
import { getLeaderboard } from "./handlers/leaderboard.ts";
import { getPass, postPassClaim } from "./handlers/pass.ts";
import { getStore, postEquip, postRedeem } from "./handlers/store.ts";

type Handler = (ctx: Ctx) => Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "POST /v1/guest": createGuest,
  "GET /v1/state": getState,
  "POST /v1/intent": postIntent,
  "POST /v1/auth/google": postGoogle,
  "POST /v1/logout": postLogout,
  "GET /v1/map": getMap,
  "GET /v1/reports": getReports,
  "GET /v1/alliances": getAlliances,
  "GET /v1/alliance": getAlliance,
  "POST /v1/alliance": postCreateAlliance,
  "POST /v1/alliance/join": postJoinAlliance,
  "POST /v1/alliance/leave": postLeaveAlliance,
  "POST /v1/alliance/kick": postKick,
  "POST /v1/alliance/promote": postPromote,
  "POST /v1/alliance/demote": postDemote,
  "POST /v1/alliance/transfer": postTransfer,
  "POST /v1/alliance/hq": postHq,
  "POST /v1/help/request": postHelpRequest,
  "POST /v1/help/give": postHelpGive,
  "GET /v1/events": getEvents,
  "POST /v1/events/claim": postEventClaim,
  "GET /v1/leaderboard": getLeaderboard,
  "GET /v1/pass": getPass,
  "POST /v1/pass/claim": postPassClaim,
  "GET /v1/store": getStore,
  "POST /v1/store/redeem": postRedeem,
  "POST /v1/cosmetics/equip": postEquip,
};

const route = async (req: Request, env: Env, deps: Deps): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const handler = ROUTES[`${req.method} ${new URL(req.url).pathname}`];
  if (handler === undefined) return errorResponse("not_found");
  try {
    return await handler({ req, env, deps, now: deps.now() });
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e.code);
    deps.crash.capture(e, { path: new URL(req.url).pathname });
    throw e;
  }
};

/** The WebSockets: their 101 answers go back untouched (no CORS for WebSockets). */
const SOCKETS: Record<string, Handler> = { "/v1/map/ws": connectMap, "/v1/alliance/ws": connectAlliance };

/** The whole API. Entry modules supply the clock, Google keys and the map. */
export const handle = async (req: Request, env: Env, deps: Deps): Promise<Response> => {
  const socket = req.method === "GET" ? SOCKETS[new URL(req.url).pathname] : undefined;
  if (socket !== undefined) {
    try {
      return await socket({ req, env, deps, now: deps.now() });
    } catch (e) {
      if (e instanceof HttpError) return errorResponse(e.code);
      throw e;
    }
  }
  return withCors(req, env, await route(req, env, deps));
};
