import { protocolToken } from "../auth/tokens.ts";
import { latestReports } from "../db/reports.ts";
import { csv } from "../env.ts";
import { HttpError, json } from "../http.ts";
import { authenticate, authenticateToken, type Ctx } from "./context.ts";

/** GET /v1/map — the account's server map as they see it. Places their base on first visit. */
export const getMap = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  return json(await ctx.deps.map(ctx.env, account.server).view(account.id, ctx.now));
};

/** GET /v1/reports — the latest battle reports, newest first. */
export const getReports = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  return json({ reports: await latestReports(ctx.env.DB, account.id), now: ctx.now });
};

/**
 * GET /v1/map/ws — the live map. The token comes as a subprotocol (see `protocolToken`).
 * CORS does not apply to WebSockets, so a browser Origin is checked here; native clients send none.
 */
export const connectMap = async (ctx: Ctx): Promise<Response> => {
  if (ctx.req.headers.get("upgrade")?.toLowerCase() !== "websocket") throw new HttpError("upgrade_required");
  const origin = ctx.req.headers.get("origin");
  if (origin !== null && !csv(ctx.env.ALLOWED_ORIGINS).includes(origin)) throw new HttpError("forbidden");
  const { account } = await authenticateToken(ctx, protocolToken(ctx.req));
  return ctx.deps.map(ctx.env, account.server).connect(ctx.req, account.id, ctx.now);
};
