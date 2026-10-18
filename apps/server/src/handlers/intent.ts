import { BUILDING_IDS, parseTroops, startTraining, startUpgrade, TROOP_IDS, type BaseState, type BuildingId, type TroopId, type Troops } from "@revolt/rules";
import { loadBase, saveBase } from "../db/bases.ts";
import { HttpError, json, readJson } from "../http.ts";
import { authenticate, type Ctx } from "./context.ts";

export type Intent =
  | { readonly type: "upgrade"; readonly building: BuildingId }
  | { readonly type: "train"; readonly troop: TroopId; readonly count: number }
  | { readonly type: "march"; readonly target: string; readonly troops: Troops };

const MAX_TARGET_ID = 64;

/** Only the intent's name, target and counts are read; any other numbers a client sends are ignored. */
export const parseIntent = (body: Record<string, unknown>): Intent => {
  const { type } = body;
  if (type === "upgrade" && BUILDING_IDS.some((id) => id === body.building)) return { type, building: body.building as BuildingId };
  if (type === "train" && TROOP_IDS.some((id) => id === body.troop) && typeof body.count === "number") {
    return { type, troop: body.troop as TroopId, count: body.count };
  }
  if (type === "march" && typeof body.target === "string" && body.target.length > 0 && body.target.length <= MAX_TARGET_ID) {
    const troops = parseTroops(body.troops);
    if (troops !== null) return { type, target: body.target, troops };
  }
  throw new HttpError("bad_request");
};

type BaseChange = { readonly ok: true; readonly state: BaseState } | { readonly ok: false; readonly reason: string; readonly state: BaseState };

const ATTEMPTS = 2;

/** Applies a base-only intent with the shared rules at server time and saves it (compare-and-set). */
const changeBase = async (ctx: Ctx, accountId: string, apply: (s: BaseState) => BaseChange): Promise<Response> => {
  for (let i = 0; i < ATTEMPTS; i++) {
    const stored = await loadBase(ctx.env.DB, accountId);
    if (stored === null) throw new HttpError("not_found");
    const result = apply(stored.state);
    if (!result.ok) return json({ ok: false, reason: result.reason, state: result.state, now: ctx.now });
    if (await saveBase(ctx.env.DB, accountId, result.state, stored.version, ctx.now)) {
      return json({ ok: true, state: result.state, now: ctx.now });
    }
  }
  throw new HttpError("conflict");
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
      return changeBase(ctx, account.id, (s) => startUpgrade(s, intent.building, ctx.now));
    case "train":
      return changeBase(ctx, account.id, (s) => startTraining(s, intent.troop, intent.count, ctx.now));
    case "march": {
      const r = await ctx.deps.map(ctx.env, account.server).sendMarch(account.id, intent.target, intent.troops, ctx.now);
      if ("error" in r) throw new HttpError(r.error);
      return json({ ...r, now: ctx.now });
    }
  }
};
