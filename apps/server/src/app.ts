import type { Deps, Env } from "./env.ts";
import { errorResponse, HttpError, withCors } from "./http.ts";
import type { Ctx } from "./handlers/context.ts";
import { postGoogle } from "./handlers/google.ts";
import { createGuest } from "./handlers/guest.ts";
import { postIntent } from "./handlers/intent.ts";
import { getState } from "./handlers/state.ts";

type Handler = (ctx: Ctx) => Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "POST /v1/guest": createGuest,
  "GET /v1/state": getState,
  "POST /v1/intent": postIntent,
  "POST /v1/auth/google": postGoogle,
};

const route = async (req: Request, env: Env, deps: Deps): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const handler = ROUTES[`${req.method} ${new URL(req.url).pathname}`];
  if (handler === undefined) return errorResponse("not_found");
  try {
    return await handler({ req, env, deps, now: deps.now() });
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e.code);
    throw e;
  }
};

/** The whole API. Entry modules supply the clock and Google keys. */
export const handle = async (req: Request, env: Env, deps: Deps): Promise<Response> =>
  withCors(req, env, await route(req, env, deps));
