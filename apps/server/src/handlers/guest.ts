import { createBaseState, importM1Save, isBaseState } from "@revolt/rules";
import { newToken } from "../auth/tokens.ts";
import { insertAccount } from "../db/accounts.ts";
import { insertBase } from "../db/bases.ts";
import { insertSession } from "../db/sessions.ts";
import { json, readJson } from "../http.ts";
import { accountView, type Ctx } from "./context.ts";

/**
 * POST /v1/guest — creates a guest account and session for a new device.
 * A pre-M2 local save may be imported here, and only here; it is bounded by `importM1Save`.
 */
export const createGuest = async (ctx: Ctx): Promise<Response> => {
  const body = await readJson(ctx.req);
  const imported = "importSave" in body && isBaseState(body.importSave);
  const state = imported ? importM1Save(body.importSave, ctx.now) : createBaseState(ctx.now);
  const id = crypto.randomUUID();
  const token = newToken();
  const db = ctx.env.DB;
  await db.batch([
    insertAccount(db, { id, now: ctx.now, importedM1: imported }),
    insertBase(db, id, state, ctx.now),
    await insertSession(db, token, id, ctx.now),
  ]);
  const account = accountView({ id, googleSub: null, googleEmail: null });
  return json({ token, account, state, now: ctx.now, imported }, 201);
};
