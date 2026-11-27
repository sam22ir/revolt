import {
  advance,
  checkDailyClaim,
  checkQuestClaim,
  currentQuest,
  DAILY_MISSIONS,
  dailyClaimKey,
  dailyMissions,
  isDailyMissionId,
  missionDay,
  missionDayStart,
  passKey,
  passSeasonAt,
  QUEST_IDS,
  questClaimKey,
  QUESTS,
  type BaseState,
  type MissionBlockReason,
  type MissionsView,
  type QuestContext,
} from "@revolt/rules";
import type { Account } from "../db/accounts.ts";
import { findMembership } from "../db/alliances.ts";
import { loadBase } from "../db/bases.ts";
import { runGrant } from "../db/grants.ts";
import { loadWorld } from "../db/liberations.ts";
import { claimedDaily, claimedQuests, daySums } from "../db/missions.ts";
import { HttpError, json, readJson } from "../http.ts";
import { authenticate, type Ctx } from "./context.ts";
import { backgroundOf } from "./live-support.ts";

const refuse = (ctx: Ctx, reason: MissionBlockReason): Response => json({ ok: false, reason, now: ctx.now });

/** The base at server time, and whether the player is in an alliance: everything a quest goal reads. */
const questInputs = async (ctx: Ctx, account: Account): Promise<{ state: BaseState; qctx: QuestContext }> => {
  const stored = await loadBase(ctx.env.DB, account.id);
  if (stored === null) throw new HttpError("not_found");
  const state = advance(stored.state, ctx.now, await loadWorld(ctx.env.DB, account.server));
  const qctx = { inAlliance: (await findMembership(ctx.env.DB, account.id)) !== null };
  return { state, qctx };
};

/** GET /v1/missions — today's daily missions with their progress, and the current step of the beginner quest chain. */
export const getMissions = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const db = ctx.env.DB;
  const bg = backgroundOf(account);
  const day = missionDay(ctx.now, bg);
  const statuses = dailyMissions(await daySums(db, account.id, day), await claimedDaily(db, account.id, day));
  const { state, qctx } = await questInputs(ctx, account);
  const q = currentQuest(state, qctx, await claimedQuests(db, account.id));
  const body: MissionsView = {
    day,
    resetsAt: missionDayStart(day + 1, bg),
    daily: statuses.map((m) => ({ ...m, reward: DAILY_MISSIONS[m.id].reward, passXp: DAILY_MISSIONS[m.id].passXp })),
    quest: q === null ? null : { ...q, goal: QUESTS[q.id].goal, reward: QUESTS[q.id].reward, step: QUEST_IDS.indexOf(q.id) + 1, steps: QUEST_IDS.length },
    now: ctx.now,
  };
  return json(body);
};

/**
 * POST /v1/missions/claim `{ mission }` — pays a daily mission done today, once per day. The reward and the mission's
 * pass XP land in one grant batch, so a claim cannot pay one without the other.
 */
export const postMissionClaim = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const id = (await readJson(ctx.req)).mission;
  if (typeof id !== "string" || id.length > 64) throw new HttpError("bad_request");
  const db = ctx.env.DB;
  const bg = backgroundOf(account);
  const day = missionDay(ctx.now, bg);
  const why = checkDailyClaim(dailyMissions(await daySums(db, account.id, day), await claimedDaily(db, account.id, day)), id);
  if (why !== null || !isDailyMissionId(id)) return refuse(ctx, why ?? "unknown_mission");
  const def = DAILY_MISSIONS[id];
  const claimKey = dailyClaimKey(day, id);
  const g = await runGrant(db, {
    accountId: account.id,
    server: account.server,
    claimKey,
    now: ctx.now,
    background: bg,
    reward: def.reward,
    extra: (guard) => [
      db
        .prepare(`INSERT OR IGNORE INTO live_awards (march_id, key, account_id, server, points, at) SELECT ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`)
        .bind(claimKey, passKey(passSeasonAt(ctx.now).index), account.id, account.server, def.passXp, ctx.now, ...guard.binds),
    ],
  });
  if (g.kind === "duplicate") return refuse(ctx, "already_claimed");
  if (g.kind === "conflict" || g.kind === "refused") throw new HttpError("conflict");
  ctx.deps.analytics.track("mission_claim", { mission: id });
  return json({ ok: true, reward: def.reward, passXp: def.passXp, ...(g.state === null ? {} : { state: g.state }), now: ctx.now });
};

/** POST /v1/quests/claim `{ quest }` — pays the current beginner quest once its goal is met. Quests go in chain order. */
export const postQuestClaim = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const id = (await readJson(ctx.req)).quest;
  if (typeof id !== "string" || id.length > 64) throw new HttpError("bad_request");
  const { state, qctx } = await questInputs(ctx, account);
  const why = checkQuestClaim(state, qctx, await claimedQuests(ctx.env.DB, account.id), id);
  const quest = QUEST_IDS.find((q) => q === id);
  if (why !== null || quest === undefined) return refuse(ctx, why ?? "unknown_mission");
  const reward = QUESTS[quest].reward;
  const g = await runGrant(ctx.env.DB, { accountId: account.id, server: account.server, claimKey: questClaimKey(quest), now: ctx.now, background: backgroundOf(account), reward });
  if (g.kind === "duplicate") return refuse(ctx, "already_claimed");
  if (g.kind === "conflict" || g.kind === "refused") throw new HttpError("conflict");
  ctx.deps.analytics.track("quest_claim", { quest });
  return json({ ok: true, reward, ...(g.state === null ? {} : { state: g.state }), now: ctx.now });
};
