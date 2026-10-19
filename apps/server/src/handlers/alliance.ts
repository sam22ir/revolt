import {
  ALLIANCE_NAME_MAX,
  canKick,
  canPerform,
  demotedRank,
  promotedRank,
  validateAllianceName,
  validateAllianceTag,
  type AllianceBlockReason,
  type AllianceView,
} from "@revolt/rules";
import { protocolToken } from "../auth/tokens.ts";
import { findAccountById, type Account } from "../db/accounts.ts";
import {
  createAlliance,
  demoteMember,
  findMemberByHandle,
  findMembership,
  joinAlliance,
  kickMember,
  leaveAlliance,
  loadAllianceView,
  promoteMember,
  searchAlliances,
  transferLeadership,
  type Membership,
} from "../db/alliances.ts";
import { listOpenRequests } from "../db/help.ts";
import { csv } from "../env.ts";
import { HttpError, json, readJson } from "../http.ts";
import { authenticate, authenticateToken, type Ctx } from "./context.ts";
import { bestEffort, viewerFor, viewerOf } from "./viewer.ts";

const refuse = (ctx: Ctx, reason: AllianceBlockReason): Response => json({ ok: false, reason, now: ctx.now });

const MAX_ID = 64;
const MAX_HANDLE = 16;

const str = (v: unknown, max: number): string => {
  if (typeof v !== "string" || v.length === 0 || v.length > max) throw new HttpError("bad_request");
  return v;
};

/** The alliance as its member sees it, with the HQ the map holds. */
const viewOf = async (ctx: Ctx, account: Account, m: Membership): Promise<AllianceView> => {
  let hq: { x: number; y: number } | null = null;
  await bestEffort("hq lookup", async () => {
    hq = await ctx.deps.map(ctx.env, account.server).hqOf(m.allianceId);
  });
  return loadAllianceView(ctx.env.DB, m, account.id, hq);
};

const ok = async (ctx: Ctx, account: Account): Promise<Response> => {
  const m = await findMembership(ctx.env.DB, account.id);
  return json({ ok: true, alliance: m === null ? null : await viewOf(ctx, account, m), now: ctx.now });
};

/** Tells the room's connected members that membership or ranks changed. */
const notifyMembers = (ctx: Ctx, allianceId: string): Promise<void> =>
  bestEffort("room notify", () => ctx.deps.room(ctx.env, allianceId).notify("members_changed"));

/** Tells the map who a player is now (their alliance tag shows on their base). */
const syncMap = async (ctx: Ctx, account: Account): Promise<void> => {
  const { viewer } = await viewerFor(ctx, account);
  await bestEffort("map sync", () => ctx.deps.map(ctx.env, account.server).setAlliance(viewer, ctx.now));
};

/** GET /v1/alliances?q= — alliances on the player's server whose name starts with `q`. */
export const getAlliances = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const q = (new URL(ctx.req.url).searchParams.get("q") ?? "").trim();
  if (q.length > ALLIANCE_NAME_MAX * 2) throw new HttpError("bad_request");
  return json({ alliances: await searchAlliances(ctx.env.DB, account.server, q), now: ctx.now });
};

/** GET /v1/alliance — the player's alliance and the open help requests of its members. */
export const getAlliance = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const m = await findMembership(ctx.env.DB, account.id);
  if (m === null) return json({ alliance: null, help: [], now: ctx.now });
  const [alliance, help] = await Promise.all([viewOf(ctx, account, m), listOpenRequests(ctx.env.DB, m.allianceId, account.id, ctx.now)]);
  return json({ alliance, help, now: ctx.now });
};

/** POST /v1/alliance `{ name, tag }` — founds an alliance; the founder is its leader. */
export const postCreateAlliance = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const body = await readJson(ctx.req);
  const name = validateAllianceName(body.name);
  const tag = validateAllianceTag(body.tag);
  if (name === null) return refuse(ctx, "bad_name");
  if (tag === null) return refuse(ctx, "bad_tag");
  if ((await findMembership(ctx.env.DB, account.id)) !== null) return refuse(ctx, "already_member");
  const r = await createAlliance(ctx.env.DB, { id: crypto.randomUUID(), server: account.server, name, tag, founderId: account.id, now: ctx.now });
  if (!r.ok) return refuse(ctx, r.reason);
  await syncMap(ctx, account);
  return ok(ctx, account);
};

/** POST /v1/alliance/join `{ id }` — all alliances are open in M4. */
export const postJoinAlliance = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const id = str((await readJson(ctx.req)).id, MAX_ID);
  if ((await findMembership(ctx.env.DB, account.id)) !== null) return refuse(ctx, "already_member");
  const r = await joinAlliance(ctx.env.DB, account.id, id, account.server, ctx.now);
  if (!r.ok) return refuse(ctx, r.reason);
  await notifyMembers(ctx, id);
  await syncMap(ctx, account);
  return ok(ctx, account);
};

/** POST /v1/alliance/leave — a leader may leave only as the last member, which ends the alliance. */
export const postLeaveAlliance = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const m = await findMembership(ctx.env.DB, account.id);
  if (m === null) return refuse(ctx, "not_member");
  const r = await leaveAlliance(ctx.env.DB, account.id, m.allianceId);
  if (!r.ok) return refuse(ctx, r.reason);
  const room = ctx.deps.room(ctx.env, m.allianceId);
  if (r.disbanded) {
    await bestEffort("room disband", () => room.disband());
    await bestEffort("map alliance removal", () => ctx.deps.map(ctx.env, account.server).removeAlliance(m.allianceId, ctx.now));
  } else {
    await bestEffort("room leave", () => room.memberChanged(account.id, null));
    await notifyMembers(ctx, m.allianceId);
  }
  await syncMap(ctx, account);
  return ok(ctx, account);
};

type MemberAction = "kick" | "promote" | "demote" | "transfer";

/** kick, promote, demote and transfer: `{ handle }` of a member of the actor's own alliance. */
const memberAction = (action: MemberAction) => async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const handle = str((await readJson(ctx.req)).handle, MAX_HANDLE);
  const m = await findMembership(ctx.env.DB, account.id);
  if (m === null) return refuse(ctx, "not_member");
  if (!canPerform(m.rank, action)) return refuse(ctx, "no_permission");
  const target = await findMemberByHandle(ctx.env.DB, m.allianceId, handle);
  if (target === null) return refuse(ctx, "target_not_found");
  const db = ctx.env.DB;
  const room = ctx.deps.room(ctx.env, m.allianceId);
  let changed = false;
  if (action === "kick") {
    if (!canKick(m.rank, target.rank)) return refuse(ctx, "target_rank");
    changed = await kickMember(db, account.id, target.accountId, m.allianceId);
    if (changed) {
      await bestEffort("room kick", () => room.memberChanged(target.accountId, null));
      const t = await findAccountById(db, target.accountId);
      if (t !== null) await bestEffort("map sync", () => ctx.deps.map(ctx.env, t.server).setAlliance(viewerOf(t, null), ctx.now));
    }
  } else if (action === "promote") {
    const next = promotedRank(target.rank);
    if (next === null) return refuse(ctx, "target_rank");
    changed = await promoteMember(db, account.id, target.accountId, m.allianceId);
    if (changed) await bestEffort("room rank", () => room.memberChanged(target.accountId, next));
  } else if (action === "demote") {
    const next = demotedRank(target.rank);
    if (next === null) return refuse(ctx, "target_rank");
    changed = await demoteMember(db, account.id, target.accountId, m.allianceId);
    if (changed) await bestEffort("room rank", () => room.memberChanged(target.accountId, next));
  } else {
    if (target.rank === "leader" || target.accountId === account.id) return refuse(ctx, "target_rank");
    changed = await transferLeadership(db, account.id, target.accountId, m.allianceId);
    if (changed) {
      await bestEffort("room rank", () => room.memberChanged(target.accountId, "leader"));
      await bestEffort("room rank", () => room.memberChanged(account.id, "officer"));
    }
  }
  // The write lost a race with another change (a rank moved, the member left): the rules said no at the time of writing.
  if (!changed) return refuse(ctx, "no_permission");
  await notifyMembers(ctx, m.allianceId);
  return ok(ctx, account);
};

export const postKick = memberAction("kick");
export const postPromote = memberAction("promote");
export const postDemote = memberAction("demote");
export const postTransfer = memberAction("transfer");

/** POST /v1/alliance/hq `{ x, y }` — the leader puts the alliance HQ on a free tile. */
export const postHq = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const body = await readJson(ctx.req);
  const { x, y } = body;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) throw new HttpError("bad_request");
  const { viewer, membership: m } = await viewerFor(ctx, account);
  if (m === null) return refuse(ctx, "not_member");
  if (!canPerform(m.rank, "set_hq")) return refuse(ctx, "no_permission");
  const r = await ctx.deps.map(ctx.env, account.server).setHq(viewer, x, y, ctx.now);
  if (!r.ok) return refuse(ctx, r.reason);
  await notifyMembers(ctx, m.allianceId);
  return ok(ctx, account);
};

/**
 * GET /v1/alliance/ws — the alliance chat. The token comes as a subprotocol (see `protocolToken`); CORS does not
 * apply to WebSockets, so a browser Origin is checked here. Members only: membership is read from D1.
 */
export const connectAlliance = async (ctx: Ctx): Promise<Response> => {
  if (ctx.req.headers.get("upgrade")?.toLowerCase() !== "websocket") throw new HttpError("upgrade_required");
  const origin = ctx.req.headers.get("origin");
  if (origin !== null && !csv(ctx.env.ALLOWED_ORIGINS).includes(origin)) throw new HttpError("forbidden");
  const { account } = await authenticateToken(ctx, protocolToken(ctx.req));
  const m = await findMembership(ctx.env.DB, account.id);
  if (m === null) throw new HttpError("forbidden");
  return ctx.deps.room(ctx.env, m.allianceId).connect(ctx.req, { accountId: account.id, handle: account.handle, rank: m.rank });
};
