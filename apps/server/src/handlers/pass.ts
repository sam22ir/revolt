import { claimTier, isPassTrack, passSeasonAt, reachedTier, type PassBlockReason, type PassView } from "@revolt/rules";
import { runGrant } from "../db/grants.ts";
import { loadPass } from "../db/live.ts";
import { HttpError, json, readJson } from "../http.ts";
import { authenticate, type Ctx } from "./context.ts";
import { backgroundOf } from "./live-support.ts";

const refuse = (ctx: Ctx, reason: PassBlockReason): Response => json({ ok: false, reason, now: ctx.now });

/** GET /v1/pass — the player's battle pass for the season that is running. */
export const getPass = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const { season, progress } = await loadPass(ctx.env.DB, account.id, ctx.now);
  const s = passSeasonAt(ctx.now);
  const body: PassView = {
    season,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    xp: progress.xp,
    tier: reachedTier(progress),
    premium: progress.premium,
    claimedFree: progress.claimedFree,
    claimedPremium: progress.claimedPremium,
    now: ctx.now,
  };
  return json(body);
};

/** POST /v1/pass/claim `{ tier, track }` — pays one tier of one track, once. The premium track needs the purchase. */
export const postPassClaim = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const b = await readJson(ctx.req);
  if (typeof b.tier !== "number" || !isPassTrack(b.track)) throw new HttpError("bad_request");
  const { season, progress } = await loadPass(ctx.env.DB, account.id, ctx.now);
  const r = claimTier(progress, b.tier, b.track);
  if (!r.ok) return refuse(ctx, r.reason);
  const g = await runGrant(ctx.env.DB, {
    accountId: account.id,
    claimKey: `pass:${season}:${b.track}:${b.tier}`,
    now: ctx.now,
    background: backgroundOf(account),
    reward: r.reward,
  });
  if (g.kind === "duplicate") return refuse(ctx, "already_claimed");
  if (g.kind === "conflict" || g.kind === "refused") throw new HttpError("conflict");
  ctx.deps.analytics.track("pass_claim", { track: b.track, tier: b.tier });
  return json({ ok: true, reward: r.reward, ...(g.state === null ? {} : { state: g.state }), now: ctx.now });
};
