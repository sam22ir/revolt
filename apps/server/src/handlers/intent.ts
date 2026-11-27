import {
  advance,
  BUILDING_IDS,
  backgroundOfServer,
  canPerform,
  claimChapter,
  HERO_IDS,
  isHelpKind,
  type HelpKind,
  levelUpHero,
  parseHeroLoadout,
  parseTroops,
  recruitHero,
  seededRng,
  startHealing,
  startTraining,
  startUpgrade,
  TROOP_IDS,
  type BaseState,
  type BuildingId,
  type HeroId,
  type HeroLoadout,
  type TroopId,
  type Troops,
  type World,
} from "@revolt/rules";
import type { Account } from "../db/accounts.ts";
import { loadBase, saveBase } from "../db/bases.ts";
import { loadWorld } from "../db/liberations.ts";
import { speedUpIntent } from "./speedup.ts";
import { syncSnapshot } from "./live-support.ts";
import { HttpError, json, readJson } from "../http.ts";
import { authenticate, type Ctx } from "./context.ts";
import { viewerFor } from "./viewer.ts";

export type Intent =
  | { readonly type: "upgrade"; readonly building: BuildingId }
  | { readonly type: "train"; readonly troop: TroopId; readonly count: number }
  | { readonly type: "march"; readonly target: string; readonly troops: Troops; readonly heroes: HeroLoadout | null }
  | { readonly type: "rally_start"; readonly target: string; readonly troops: Troops; readonly gather: number }
  | { readonly type: "rally_join"; readonly rally: string; readonly troops: Troops }
  | { readonly type: "harvest_start"; readonly site: string; readonly troops: Troops }
  | { readonly type: "harvest_recall"; readonly march: string }
  | { readonly type: "heal" }
  | { readonly type: "recruit" }
  | { readonly type: "hero_level"; readonly hero: HeroId }
  | { readonly type: "story_claim" }
  | { readonly type: "speedup"; readonly job: HelpKind; readonly tokens: number };

const MAX_TARGET_ID = 64;

/** Only the intent's name, target and counts are read; any other numbers a client sends are ignored. */
export const parseIntent = (body: Record<string, unknown>): Intent => {
  const { type } = body;
  if (type === "upgrade" && BUILDING_IDS.some((id) => id === body.building)) return { type, building: body.building as BuildingId };
  if (type === "recruit" || type === "heal") return { type };
  if (type === "hero_level" && HERO_IDS.some((id) => id === body.hero)) return { type, hero: body.hero as HeroId };
  if (type === "train" && TROOP_IDS.some((id) => id === body.troop) && typeof body.count === "number") {
    return { type, troop: body.troop as TroopId, count: body.count };
  }
  if (type === "story_claim") return { type };
  if (type === "speedup" && isHelpKind(body.job) && typeof body.tokens === "number") return { type, job: body.job, tokens: body.tokens };
  if (type === "march" && typeof body.target === "string" && body.target.length > 0 && body.target.length <= MAX_TARGET_ID) {
    const troops = parseTroops(body.troops);
    // Heroes are optional: absent or null means the march takes none; anything else must parse.
    const rawHeroes = body.heroes ?? null;
    const heroes = rawHeroes === null ? null : parseHeroLoadout(rawHeroes);
    if (troops !== null && (rawHeroes === null || heroes !== null)) return { type, target: body.target, troops, heroes };
  }
  if (type === "rally_start" && typeof body.target === "string" && body.target.length > 0 && body.target.length <= MAX_TARGET_ID && typeof body.gather === "number") {
    const troops = parseTroops(body.troops);
    if (troops !== null) return { type, target: body.target, troops, gather: body.gather };
  }
  if (type === "rally_join" && typeof body.rally === "string" && body.rally.length > 0 && body.rally.length <= MAX_TARGET_ID) {
    const troops = parseTroops(body.troops);
    if (troops !== null) return { type, rally: body.rally, troops };
  }
  if (type === "harvest_start" && typeof body.site === "string" && body.site.length > 0 && body.site.length <= MAX_TARGET_ID) {
    const troops = parseTroops(body.troops);
    if (troops !== null) return { type, site: body.site, troops };
  }
  if (type === "harvest_recall" && typeof body.march === "string" && body.march.length > 0 && body.march.length <= MAX_TARGET_ID) {
    return { type, march: body.march };
  }
  throw new HttpError("bad_request");
};

/** A base change the rules accepted may add `extra` fields to the answer (a recruit's draw). */
type BaseChange =
  | { readonly ok: true; readonly state: BaseState; readonly extra?: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly reason: string; readonly state: BaseState };

const ATTEMPTS = 2;

/** Applies a base-only intent with the shared rules at server time and saves it (compare-and-set). */
const changeBase = async (ctx: Ctx, account: Account, apply: (s: BaseState, world: World) => BaseChange): Promise<Response> => {
  const accountId = account.id;
  const world = await loadWorld(ctx.env.DB, account.server);
  for (let i = 0; i < ATTEMPTS; i++) {
    const stored = await loadBase(ctx.env.DB, account.id);
    if (stored === null) throw new HttpError("not_found");
    const result = apply(stored.state, world);
    if (!result.ok) return json({ ok: false, reason: result.reason, state: result.state, liberations: world.liberations, now: ctx.now });
    if (await saveBase(ctx.env.DB, accountId, result.state, stored.version, ctx.now)) {
      await syncSnapshot(ctx, account, advance(result.state, ctx.now, world));
      return json({ ok: true, state: result.state, liberations: world.liberations, now: ctx.now, ...(result.ok ? result.extra : undefined) });
    }
  }
  throw new HttpError("conflict");
};

/** A refusal the Worker decides itself (before the map is asked), with the player's current base state. */
const refusedIntent = async (ctx: Ctx, account: Account, reason: string): Promise<Response> => {
  const stored = await loadBase(ctx.env.DB, account.id);
  if (stored === null) throw new HttpError("not_found");
  const world = await loadWorld(ctx.env.DB, account.server);
  return json({ ok: false, reason, state: advance(stored.state, ctx.now, world), liberations: world.liberations, now: ctx.now });
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
      return changeBase(ctx, account, (s, w) => startUpgrade(s, intent.building, ctx.now, w));
    case "train":
      return changeBase(ctx, account, (s, w) => startTraining(s, intent.troop, intent.count, ctx.now, w));
    case "heal":
      return changeBase(ctx, account, (s, w) => startHealing(s, ctx.now, w));
    case "recruit":
      // The server picks the seed, so the client never chooses the draw.
      return changeBase(ctx, account, (s, w) => {
        const r = recruitHero(s, ctx.now, seededRng(crypto.getRandomValues(new Uint32Array(1))[0]!), w, backgroundOfServer(account.server));
        if (!r.ok) return r;
        const { heroId, rarity, duplicate, forced } = r.draw;
        return { ok: true, state: r.state, extra: { draw: { heroId, rarity, duplicate, forced } } };
      });
    case "hero_level":
      return changeBase(ctx, account, (s) => levelUpHero(s, intent.hero));
    case "story_claim":
      return changeBase(ctx, account, (s, w) => claimChapter(s, ctx.now, w, backgroundOfServer(account.server)));
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
      if (membership === null) return refusedIntent(ctx, account, "not_member");
      if (!canPerform(membership.rank, "start_rally")) return refusedIntent(ctx, account, "no_permission");
      const r = await ctx.deps.map(ctx.env, account.server).startRally(viewer, intent.target, intent.troops, intent.gather, ctx.now);
      if ("error" in r) throw new HttpError(r.error);
      return json({ ...r, now: ctx.now });
    }
    case "rally_join": {
      const { viewer, membership } = await viewerFor(ctx, account);
      if (membership === null) return refusedIntent(ctx, account, "not_member");
      const r = await ctx.deps.map(ctx.env, account.server).joinRally(viewer, intent.rally, intent.troops, ctx.now);
      if ("error" in r) throw new HttpError(r.error);
      return json({ ...r, now: ctx.now });
    }
    case "harvest_start": {
      const { viewer } = await viewerFor(ctx, account);
      const r = await ctx.deps.map(ctx.env, account.server).startHarvest(viewer, intent.site, intent.troops, ctx.now);
      if ("error" in r) throw new HttpError(r.error);
      return json({ ...r, now: ctx.now });
    }
    case "harvest_recall": {
      const { viewer } = await viewerFor(ctx, account);
      const r = await ctx.deps.map(ctx.env, account.server).recallHarvest(viewer, intent.march, ctx.now);
      if ("error" in r) throw new HttpError(r.error);
      return json({ ...r, now: ctx.now });
    }
  }
};
