import { advance, lessonBonus, battleOdds, checkLoadout, forecastFor, heroBattleModifier, parseHeroLoadout, parseTroops, snapshotHeroes, type ScoutView } from "@revolt/rules";
import { loadBase } from "../db/bases.ts";
import { loadWorld } from "../db/liberations.ts";
import { HttpError, json, readJson } from "../http.ts";
import { authenticate, type Ctx } from "./context.ts";

/**
 * POST /v1/scout `{ level, troops, heroes? }` — the watchtower's forecast for sending `troops` (and heroes the player owns) at an NPC
 * of `level`. NPC strength by level is public data, so the level is taken from the request; nothing here changes any state. Heroes
 * the player does not own, or that are away, are refused like a march would refuse them.
 */
export const postScout = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const b = await readJson(ctx.req);
  const troops = parseTroops(b.troops);
  const rawHeroes = b.heroes ?? null;
  const loadout = rawHeroes === null ? null : parseHeroLoadout(rawHeroes);
  if (typeof b.level !== "number" || !Number.isInteger(b.level) || troops === null || (rawHeroes !== null && loadout === null)) throw new HttpError("bad_request");
  const stored = await loadBase(ctx.env.DB, account.id);
  if (stored === null) throw new HttpError("not_found");
  const state = advance(stored.state, ctx.now, await loadWorld(ctx.env.DB, account.server));
  if (loadout !== null) {
    const reason = checkLoadout(state, loadout);
    if (reason !== null) return json({ ok: false, reason, now: ctx.now });
  }
  const modifier = heroBattleModifier(loadout === null ? undefined : snapshotHeroes(state.heroes, loadout));
  const odds = battleOdds(troops, b.level, modifier);
  const body: ScoutView = { forecast: odds === null ? null : forecastFor(odds, state.levels.watchtower + lessonBonus(state, "forecast_levels")), watchtower: state.levels.watchtower, now: ctx.now };
  return json(body);
};
