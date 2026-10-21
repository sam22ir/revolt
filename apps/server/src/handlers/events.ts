import {
  claimableWindows,
  activeEvents,
  EVENTS,
  eventReward,
  eventRewardTier,
  eventsFor,
  eventWindow,
  EVENT_CLAIM_GRACE_MS,
  parseEventKey,
  type EventBlockReason,
  type EventsResponse,
  type EventView,
  type EventWindow,
} from "@revolt/rules";
import { runGrant } from "../db/grants.ts";
import { eventBoard, eventScore, isClaimed, placeOnBoard } from "../db/live.ts";
import { HttpError, json, readJson } from "../http.ts";
import { authenticate, type Ctx } from "./context.ts";
import { backgroundOf } from "./live-support.ts";
import { viewerFor } from "./viewer.ts";

const refuse = (ctx: Ctx, reason: EventBlockReason): Response => json({ ok: false, reason, now: ctx.now });

/** GET /v1/events — the events open now and those that ended recently enough to claim, with the viewer's score and rank. */
export const getEvents = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const bg = backgroundOf(account);
  const windows: EventWindow[] = [...activeEvents(ctx.now, bg), ...claimableWindows(ctx.now, bg)];
  const events: EventView[] = [];
  for (const w of windows) {
    const score = await eventScore(ctx.env.DB, account.id, w.key);
    const place = score > 0 ? await placeOnBoard(ctx.env.DB, eventBoard(account.server, w.key), account.id) : null;
    const claimed = await isClaimed(ctx.env.DB, account.id, `event:${w.key}`);
    const active = ctx.now >= w.startsAt && ctx.now < w.endsAt;
    // A window that ended with nothing earned or claimed has nothing to show.
    if (!active && score === 0 && !claimed) continue;
    events.push({
      key: w.key,
      id: w.id,
      startsAt: w.startsAt,
      endsAt: w.endsAt,
      active,
      score,
      rank: place?.rank ?? null,
      tier: eventRewardTier(w.id, score),
      tiers: EVENTS[w.id].tiers.map((t) => ({ score: t.score })),
      claimed,
      claimable: !active && !claimed && eventReward(w.id, score) !== null,
      needsReview: EVENTS[w.id].needsReview,
    });
  }
  const body: EventsResponse = { events, now: ctx.now };
  return json(body);
};

/**
 * POST /v1/events/claim `{ event }` — once an event window has ended, pays the highest reward tier the player's score
 * reached, once. The score is the sum of the player's award rows; nothing the client sends is a number.
 */
export const postEventClaim = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const parsed = parseEventKey((await readJson(ctx.req)).event);
  if (parsed === null) throw new HttpError("bad_request");
  const bg = backgroundOf(account);
  if (!eventsFor(bg).includes(parsed.id)) return refuse(ctx, "unknown_event");
  const w = eventWindow(parsed.id, parsed.index);
  if (ctx.now < w.endsAt) return refuse(ctx, "not_ended");
  if (ctx.now >= w.endsAt + EVENT_CLAIM_GRACE_MS) return refuse(ctx, "claim_expired");
  // Marches resolve lazily; any map call settles everything due by `now`, so awards for marches that landed before
  // the window closed are in the table before the score is read and the one-time tier is fixed.
  const { viewer } = await viewerFor(ctx, account);
  await ctx.deps.map(ctx.env, account.server).view(viewer, ctx.now);
  const reward = eventReward(w.id, await eventScore(ctx.env.DB, account.id, w.key));
  if (reward === null) return refuse(ctx, "no_reward");
  const g = await runGrant(ctx.env.DB, { accountId: account.id, claimKey: `event:${w.key}`, now: ctx.now, background: bg, reward });
  if (g.kind === "duplicate") return refuse(ctx, "already_claimed");
  if (g.kind === "conflict" || g.kind === "refused") throw new HttpError("conflict");
  ctx.deps.analytics.track("event_claim", { event: w.id });
  return json({ ok: true, reward, ...(g.state === null ? {} : { state: g.state }), now: ctx.now });
};
