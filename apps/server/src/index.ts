import { handle } from "./app.ts";
import { googleRemoteKeys } from "./auth/google.ts";
import type { Deps, Env } from "./env.ts";

const deps: Deps = { now: () => Date.now(), googleKeys: googleRemoteKeys() };

export default {
  fetch: (req: Request, env: Env): Promise<Response> => handle(req, env, deps),
};
