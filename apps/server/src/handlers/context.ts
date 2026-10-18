import { advance, type BaseState } from "@revolt/rules";
import { bearerToken } from "../auth/tokens.ts";
import type { Account } from "../db/accounts.ts";
import { findAccountById } from "../db/accounts.ts";
import { loadBase } from "../db/bases.ts";
import { accountIdForToken } from "../db/sessions.ts";
import type { Deps, Env } from "../env.ts";
import { HttpError } from "../http.ts";

export interface Ctx {
  readonly req: Request;
  readonly env: Env;
  readonly deps: Deps;
  /** Server time for this request. Read once so a request sees one consistent `now`. */
  readonly now: number;
}

export interface AccountView {
  readonly id: string;
  readonly google: { readonly email: string | null } | null;
}

export const accountView = (a: Account): AccountView => ({
  id: a.id,
  google: a.googleSub === null ? null : { email: a.googleEmail },
});

export interface Authed {
  readonly token: string;
  readonly account: Account;
}

export const authenticate = async (ctx: Ctx): Promise<Authed> => {
  const token = bearerToken(ctx.req);
  if (token === null) throw new HttpError("unauthorized");
  const id = await accountIdForToken(ctx.env.DB, token);
  const account = id === null ? null : await findAccountById(ctx.env.DB, id);
  if (account === null) throw new HttpError("unauthorized");
  return { token, account };
};

/** The account's base brought up to `now`. Reads never write: `advance` is pure. */
export const currentBase = async (ctx: Ctx, accountId: string): Promise<{ state: BaseState; version: number }> => {
  const stored = await loadBase(ctx.env.DB, accountId);
  if (stored === null) throw new HttpError("not_found");
  return { state: advance(stored.state, ctx.now), version: stored.version };
};
