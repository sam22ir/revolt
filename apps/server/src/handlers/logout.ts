import { endSession } from "../db/sessions.ts";
import { json } from "../http.ts";
import { authenticate, type Ctx } from "./context.ts";

/**
 * POST /v1/logout — ends this device's session; other devices stay signed in.
 * A guest that logs out cannot get its base back, so the client must warn first.
 */
export const postLogout = async (ctx: Ctx): Promise<Response> => {
  const { session } = await authenticate(ctx);
  await ctx.env.DB.batch(endSession(ctx.env.DB, session, ctx.now));
  return json({ ok: true, now: ctx.now });
};
