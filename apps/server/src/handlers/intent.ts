import {
  advance,
  BUILDING_IDS,
  backgroundOfServer,
  canPerform,
  claimChapter,
  isHeroId,
  isHelpKind,
  type HelpKind,
  levelUpHero,
  MAX_SQUAD,
  parseTroops,
  recruitHero,
  startTraining,
  startUpgrade,
  TROOP_IDS,
  type BaseState,
  type BuildingId,
  type HeroId,
  type TroopId,
  type Troops,
} from "@revolt/rules";
import type { Account } from "../db/accounts.ts";
import { loadBase, saveBase } from "../db/bases.ts";
import { speedUpIntent } from "./speedup.ts";
import { syncSnapshot } from "./live-support.ts";
import { HttpError, json, readJson } from "../http.ts";
import { authenticate, type Ctx } from "./context.ts";
import { viewerFor } from "./viewer.ts";

export type Intent =
  | { readonly type: "upgrade"; readonly building: BuildingId }
  | { readonly type: "train"; readonly troop: TroopId; readonly count: number }
  | { readonly type: "march"; readonly target: string; readonly troops: Troops; readonly heroes: readonly HeroId[] }
  | { readonly type: "rally_start"; readonly target: string; readonly troops: Troops; readonly heroes: readonly HeroId[]; readonly gather: number }
  | { readonly type: "rally_join"; readonly rally: string; readonly troops: Troops; readonly heroes: readonly HeroId[] }
  | { readonly type: "hero_recruit"; readonly hero: HeroId }
  | { readonly type: "hero_level"; readonly hero: HeroId }
  | { readonly type: "story_claim" }
  | { readonly type: "speedup"; readonly job: HelpKind; readonly tokens: number };

const MAX_TARGET_ID = 64;

/** An optional lead-first list of hero ids; null if it is not a short list of known ids. Duplicates and ownership are the rules' call. */
const parseHeroes = (v: unknown): HeroId[] | null => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_SQUAD) return null;
  return v.every(isHeroId) ? [...v] : null;
};

/** Only the intent's name, target and counts are read; any other numbers a client sends are ignored. */
export const parseIntent = (body: Record<string, unknown>): Intent => {
  const { type } = body;
  if (type === "upgrade" && BUILDING_IDS.some((id) => id === body.building)) return { type, building: body.building as BuildingId };
  if (type === "train" && TROOP_IDS.some((id) => id === body.troop) && typeof body.count === "number") {
    return { type, troop: body.troop as TroopId, count: body.count };
  }
  if ((type === "hero_recruit" || type === "hero_level") && isHeroId(body.hero)) return { type, hero: body.hero };
  if (type === "story_claim") return { type };
  if (type === "speedup" && isHelpKind(body.job) && typeof body.tokens === "number") return { type, job: body.job, tokens: body.tokens };
  const heroes = parseHeroes(body.heroes);
  if (type === "march" && heroes !== null && typeof body.target === "string" && body.target.length > 0 && body.target.length <= MAX_TARGET_ID) {
    const troops = parseTroops(body.troops);
    if (troops !== null) return { type, target: body.target, troops, heroes };
  }
  if (type === "rally_start" && heroes !== null && typeof body.target === "string" && body.target.length > 0 && body.target.length <= MAX_TARGET_ID && typeof body.gather === "number") {
    const troops = parseTroops(body.troops);
    if (troops !== null) return { type, target: body.target, troops, heroes, gather: body.gather };
  }
  if (type === "rally_join" && heroes !== null && typeof body.rally === "string" && body.rally.length > 0 && body.rally.length <= MAX_TARGET_ID) {
    const troops = parseTroops(body.troops);
    if (troops !== null) return { type, rally: body.rally, troops, heroes };
  }
  throw new HttpError("bad_request");
};

type BaseChange = { readonly ok: true; readonly state: BaseState } | { readonly ok: false; readonly reason: string; readonly state: BaseState };

const ATTEMPTS = 2;

/** Applies a base-only intent with the shared rules at server time and saves it (compare-and-set). */
const changeBase = async (ctx: Ctx, account: Account, apply: (s: BaseState) => BaseChange): Promise<Response> => {
  for (let i = 0; i < ATTEMPTS; i++) {
    const stored = await loadBase(ctx.env.DB, account.id);
    if (stored === null) throw new HttpError("not_found");
    const result = apply(stored.state);
    if (!result.ok) return json({ ok: false, reason: result.reason, state: result.state, now: ctx.now });
    if (await saveBase(ctx.env.DB, account.id, result.state, stored.version, ctx.now)) {
      await syncSnapshot(ctx, account, advance(result.state, ctx.now));
      return json({ ok: true, state: result.state, now: ctx.now });
    }
  }
  throw new HttpError("conflict");
};

/** A refusal the Worker decides itself (before the map is asked), with the player's current base state. */
const refusedIntent = async (ctx: Ctx, accountId: string, reason: string): Promise<Response> => {
  const stored = await loadBase(ctx.env.DB, accountId);
  if (stored === null) throw new HttpError("not_found");
  return json({ ok: false, reason, state: advance(stored.state, ctx.now), now: ctx.now });
};

/**
 * POST /v1/intent — validates the intent with the shared rules at server time and saves it.
 * A rule rejection (e.g. not enough resources) is a normal answer: `ok: false` with a reason.
 * Marches go to the server's map, which owns targets and timing.
 */
export const postIntent = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const intent = parseIntent(await readJson(ctx.req));
  switch (intent.type) {
    case "upgrade":
      return changeBase(ctx, account, (s) => startUpgrade(s, intent.building, ctx.now));
    case "train":
      return changeBase(ctx, account, (s) => startTraining(s, intent.troop, intent.count, ctx.now));
    case "hero_recruit":
      return changeBase(ctx, account, (s) => recruitHero(s, intent.hero, ctx.now, backgroundOfServer(account.server)));
    case "hero_level":
      return changeBase(ctx, account, (s) => levelUpHero(s, intent.hero, ctx.now));
    case "story_claim":
      return changeBase(ctx, account, (s) => claimChapter(s, ctx.now, backgroundOfServer(account.server)));
    case "speedup":
      return speedUpIntent(ctx, account, intent.job, intent.tokens);
    case "march": {
      const { viewer } = await viewerFor(ctx, account);
      const r = await ctx.deps.map(ctx.env, account.server).sendMarch(viewer, intent.target, intent.troops, intent.heroes, ctx.now);
      if ("error" in r) throw new HttpError(r.error);
      return json({ ...r, now: ctx.now });
    }
    case "rally_start": {
      const { viewer, membership } = await viewerFor(ctx, account);
      if (membership === null) return refusedIntent(ctx, account.id, "not_member");
      if (!canPerform(membership.rank, "start_rally")) return refusedIntent(ctx, account.id, "no_permission");
      const r = await ctx.deps.map(ctx.env, account.server).startRally(viewer, intent.target, intent.troops, intent.heroes, intent.gather, ctx.now);
      if ("error" in r) throw new HttpError(r.error);
      return json({ ...r, now: ctx.now });
    }
    case "rally_join": {
      const { viewer, membership } = await viewerFor(ctx, account);
      if (membership === null) return refusedIntent(ctx, account.id, "not_member");
      const r = await ctx.deps.map(ctx.env, account.server).joinRally(viewer, intent.rally, intent.troops, intent.heroes, ctx.now);
      if ("error" in r) throw new HttpError(r.error);
      return json({ ...r, now: ctx.now });
    }
  }
};
