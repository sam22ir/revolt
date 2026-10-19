import { advance, type BaseState } from "@revolt/rules";
import { bearerToken } from "../auth/tokens.ts";
import type { Account } from "../db/accounts.ts";
import { findAccountById } from "../db/accounts.ts";
import { loadBase } from "../db/bases.ts";
import { findSession, touchSession, type Session } from "../db/sessions.ts";
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
  /** The player's public name; other players see this, never the id. */
  readonly handle: string;
  readonly google: { readonly email: string | null } | null;
}

export const accountView = (a: Account): AccountView => ({
  id: a.id,
  handle: a.handle,
  google: a.googleSub === null ? null : { email: a.googleEmail },
});

export interface Authed {
  readonly token: string;
  readonly session: Session;
  readonly account: Account;
}

/** Resolves the bearer token to its session and account, refreshing `last_used_at` (at most hourly). */
export const authenticate = (ctx: Ctx): Promise<Authed> => authenticateToken(ctx, bearerToken(ctx.req));

/** As `authenticate`, for a token that came some other way (the map WebSocket's subprotocol). */
export const authenticateToken = async (ctx: Ctx, token: string | null): Promise<Authed> => {
  if (token === null) throw new HttpError("unauthorized");
  const session = await findSession(ctx.env.DB, token);
  const account = session === null ? null : await findAccountById(ctx.env.DB, session.accountId);
  if (session === null || account === null) throw new HttpError("unauthorized");
  await touchSession(ctx.env.DB, session, ctx.now);
  return { token, session, account };
};

/** The account's base brought up to `now`. Reads never write: `advance` is pure. */
export const currentBase = async (ctx: Ctx, accountId: string): Promise<{ state: BaseState; version: number }> => {
  const stored = await loadBase(ctx.env.DB, accountId);
  if (stored === null) throw new HttpError("not_found");
  return { state: advance(stored.state, ctx.now), version: stored.version };
};
