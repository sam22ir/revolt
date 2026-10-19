import { createBaseState, importM1Save, isBaseState, migrateBaseState } from "@revolt/rules";
import { hashToken, newToken } from "../auth/tokens.ts";
import { ipBucket } from "../client-ip.ts";
import { DEFAULT_SERVER, insertAccount, withNewHandle } from "../db/accounts.ts";
import { insertBase } from "../db/bases.ts";
import { takeGuestSlot } from "../db/guest-rate.ts";
import { insertSession } from "../db/sessions.ts";
import { guestLimitPerHour } from "../env.ts";
import { HttpError, json, readJson } from "../http.ts";
import { accountView, type Ctx } from "./context.ts";

/**
 * POST /v1/guest — creates a guest account and session for a new device.
 * A pre-M2 local save may be imported here, and only here; it is bounded by `importM1Save`.
 * Limited per client IP per hour, checked before the body is read.
 */
export const createGuest = async (ctx: Ctx): Promise<Response> => {
  const bucket = await hashToken(`guest:${ipBucket(ctx.req)}`);
  if (!(await takeGuestSlot(ctx.env.DB, bucket, ctx.now, guestLimitPerHour(ctx.env)))) throw new HttpError("rate_limited");
  const body = await readJson(ctx.req);
  // Saves from M1 predate the barracks and troops; migrate before the shape check.
  const imported = "importSave" in body && isBaseState(migrateBaseState(body.importSave));
  const state = imported ? importM1Save(body.importSave, ctx.now) : createBaseState(ctx.now);
  const id = crypto.randomUUID();
  const token = newToken();
  const db = ctx.env.DB;
  const session = await insertSession(db, token, id, ctx.now);
  const handle = await withNewHandle(async (h) => {
    await db.batch([insertAccount(db, { id, handle: h, now: ctx.now, importedM1: imported }), insertBase(db, id, state, ctx.now), session]);
    return h;
  });
  const account = accountView({ id, googleSub: null, googleEmail: null, server: DEFAULT_SERVER, handle });
  return json({ token, account, state, now: ctx.now, imported }, 201);
};
