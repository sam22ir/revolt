import { createBaseState } from "@revolt/rules";
import { verifyGoogleIdToken, type GoogleIdentity } from "../auth/google.ts";
import { newToken } from "../auth/tokens.ts";
import { DEFAULT_SERVER, findAccountByGoogleSub, insertAccount, linkGoogle, type Account } from "../db/accounts.ts";
import { isUniqueViolation } from "../db/db.ts";
import { insertBase } from "../db/bases.ts";
import { endSession, insertSession } from "../db/sessions.ts";
import { csv } from "../env.ts";
import { HttpError, json, readJson } from "../http.ts";
import { accountView, authenticate, currentBase, type Ctx } from "./context.ts";

/** Creates a new account already linked to `who`, or returns the one that won a race for it. */
const createLinkedAccount = async (ctx: Ctx, who: GoogleIdentity): Promise<Account> => {
  const db = ctx.env.DB;
  const id = crypto.randomUUID();
  try {
    await db.batch([
      insertAccount(db, { id, now: ctx.now, googleSub: who.sub, googleEmail: who.email }),
      insertBase(db, id, createBaseState(ctx.now), ctx.now),
    ]);
    return { id, googleSub: who.sub, googleEmail: who.email, server: DEFAULT_SERVER };
  } catch (e) {
    const owner = isUniqueViolation(e) ? await findAccountByGoogleSub(db, who.sub) : null;
    if (owner === null) throw e;
    return owner;
  }
};

/** Decides which account this device should use after a Google sign-in. */
const resolveAccount = async (ctx: Ctx, current: Account, who: GoogleIdentity): Promise<Account> => {
  const db = ctx.env.DB;
  const owner = await findAccountByGoogleSub(db, who.sub);
  if (owner !== null) return owner;
  if (current.googleSub === null) {
    try {
      if (await linkGoogle(db, current.id, who.sub, who.email)) return { ...current, googleSub: who.sub, googleEmail: who.email };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // Another device linked this Google account at the same moment: use its account.
      const winner = await findAccountByGoogleSub(db, who.sub);
      if (winner !== null) return winner;
      throw e;
    }
  }
  // This device's account is already linked to a different Google account.
  return createLinkedAccount(ctx, who);
};

/**
 * POST /v1/auth/google — `{ idToken }` with the device's current bearer token.
 * - Google account already linked somewhere: this device switches to that account (the second-device case).
 * - Current account is a guest: Google is linked to it, keeping its base.
 * - Current account is linked to another Google account: a new account is created for this one.
 * On a switch the device's old session ends, so a guest left behind becomes eligible for cleanup.
 */
export const postGoogle = async (ctx: Ctx): Promise<Response> => {
  const audiences = csv(ctx.env.GOOGLE_CLIENT_IDS);
  if (audiences.length === 0) throw new HttpError("google_not_configured");
  const { token, session, account: current } = await authenticate(ctx);
  const { idToken } = await readJson(ctx.req);
  if (typeof idToken !== "string" || idToken.length > 8192) throw new HttpError("bad_request");
  const who = await verifyGoogleIdToken(idToken, ctx.deps.googleKeys, audiences, ctx.now);
  if (who === null) throw new HttpError("invalid_google_token");

  const target = await resolveAccount(ctx, current, who);
  const switched = target.id !== current.id;
  let outToken = token;
  if (switched) {
    outToken = newToken();
    const db = ctx.env.DB;
    await db.batch([await insertSession(db, outToken, target.id, ctx.now), ...endSession(db, session, ctx.now)]);
  }
  const { state } = await currentBase(ctx, target.id);
  return json({ token: outToken, account: accountView(target), state, now: ctx.now, switched });
};
