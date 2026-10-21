import { createBaseState, DEFAULT_BACKGROUND, importM1Save, isBackgroundId, isBaseState, migrateBaseState } from "@revolt/rules";
import { hashToken, newToken } from "../auth/tokens.ts";
import { ipBucket } from "../client-ip.ts";
import { insertAccount, newAccountServer, withNewHandle } from "../db/accounts.ts";
import { insertBase } from "../db/bases.ts";
import { takeGuestSlot } from "../db/guest-rate.ts";
import { insertSession } from "../db/sessions.ts";
import { guestLimitPerHour } from "../env.ts";
import { HttpError, json, readJson } from "../http.ts";
import { accountView, type Ctx } from "./context.ts";

/**
 * POST /v1/guest — `{ background?, importSave? }` creates a guest account and session for a new device.
 * `background` ("algeria" by default) picks the revolution and so the map server, once and for good (GDD §2.2).
 * A pre-M2 local save may be imported here, and only here, and only into Algeria (it predates Vietnam);
 * it is bounded by `importM1Save`.
 * Limited per client IP per hour, checked before the body is read.
 */
export const createGuest = async (ctx: Ctx): Promise<Response> => {
  const bucket = await hashToken(`guest:${ipBucket(ctx.req)}`);
  if (!(await takeGuestSlot(ctx.env.DB, bucket, ctx.now, guestLimitPerHour(ctx.env)))) throw new HttpError("rate_limited");
  const body = await readJson(ctx.req);
  const background = body.background === undefined ? DEFAULT_BACKGROUND : body.background;
  if (!isBackgroundId(background)) throw new HttpError("bad_request");
  const server = newAccountServer(background);
  // Saves from M1 predate the barracks and troops; migrate before the shape check.
  const imported = background === DEFAULT_BACKGROUND && "importSave" in body && isBaseState(migrateBaseState(body.importSave));
  const state = imported ? importM1Save(body.importSave, ctx.now) : createBaseState(ctx.now);
  const id = crypto.randomUUID();
  const token = newToken();
  const db = ctx.env.DB;
  const session = await insertSession(db, token, id, ctx.now);
  const handle = await withNewHandle(async (h) => {
    await db.batch([insertAccount(db, { id, handle: h, now: ctx.now, server, importedM1: imported }), insertBase(db, id, state, ctx.now), session]);
    return h;
  });
  const account = accountView({ id, googleSub: null, googleEmail: null, server, handle });
  return json({ token, account, state, now: ctx.now, imported }, 201);
};
