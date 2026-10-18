import { BUILDING_IDS, startUpgrade, type BuildingId } from "@revolt/rules";
import { loadBase, saveBase } from "../db/bases.ts";
import { HttpError, json, readJson } from "../http.ts";
import { authenticate, type Ctx } from "./context.ts";

export type Intent = { readonly type: "upgrade"; readonly building: BuildingId };

/** Only the intent's name and target are read; any numbers a client sends are ignored. */
export const parseIntent = (body: Record<string, unknown>): Intent => {
  const { type, building } = body;
  if (type === "upgrade" && BUILDING_IDS.some((id) => id === building)) return { type, building: building as BuildingId };
  throw new HttpError("bad_request");
};

const ATTEMPTS = 2;

/**
 * POST /v1/intent — validates the intent with the shared rules at server time and saves it.
 * A rule rejection (e.g. not enough resources) is a normal answer: `ok: false` with a reason.
 */
export const postIntent = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const intent = parseIntent(await readJson(ctx.req));
  for (let i = 0; i < ATTEMPTS; i++) {
    const stored = await loadBase(ctx.env.DB, account.id);
    if (stored === null) throw new HttpError("not_found");
    const result = startUpgrade(stored.state, intent.building, ctx.now);
    if (!result.ok) return json({ ok: false, reason: result.reason, state: result.state, now: ctx.now });
    if (await saveBase(ctx.env.DB, account.id, result.state, stored.version, ctx.now)) {
      return json({ ok: true, state: result.state, now: ctx.now });
    }
  }
  throw new HttpError("conflict");
};
