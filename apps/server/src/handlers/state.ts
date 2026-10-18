import { json } from "../http.ts";
import { accountView, authenticate, currentBase, type Ctx } from "./context.ts";

/** GET /v1/state — the base as the server computes it at its own `now`. */
export const getState = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const { state } = await currentBase(ctx, account.id);
  return json({ account: accountView(account), state, now: ctx.now });
};
