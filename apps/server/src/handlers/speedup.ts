import { advance, speedUp, usedToday, utcDay, type HelpKind } from "@revolt/rules";
import type { Account } from "../db/accounts.ts";
import { loadBase } from "../db/bases.ts";
import { loadWallet, reserveTokensStatement } from "../db/live.ts";
import { HttpError, json } from "../http.ts";
import type { Ctx } from "./context.ts";
import { syncSnapshot } from "./live-support.ts";
import { walletView } from "./store.ts";

const ATTEMPTS = 3;

/**
 * Spends speed-up tokens on the running upgrade or training. The wallet change and the base save go in ONE batch, so a
 * crash cannot charge tokens without shortening the job: the wallet update applies only if the wallet is exactly as
 * read and the base is still at the version read, and the base update only if the wallet update changed its row. If
 * either guard fails neither write lands, and the whole thing is tried again from fresh state.
 */
export const speedUpIntent = async (ctx: Ctx, account: Account, job: HelpKind, tokens: number): Promise<Response> => {
  const db = ctx.env.DB;
  const day = utcDay(ctx.now);
  for (let i = 0; i < ATTEMPTS; i++) {
    const stored = await loadBase(db, account.id);
    if (stored === null) throw new HttpError("not_found");
    const w = await loadWallet(db, account.id);
    const used = usedToday(w.day, w.usedMs, ctx.now);
    const r = speedUp(stored.state, job, tokens, w.tokens, used, ctx.now);
    if (!r.ok) return json({ ok: false, reason: r.reason, state: r.state, wallet: walletView(w, ctx.now), now: ctx.now });
    // Keep the later day if the clock went backwards, so rewinding it cannot reopen the allowance.
    const newDay = Math.max(day, w.day);
    const results = (await db.batch([
      reserveTokensStatement(db, account.id, w, r.tokensUsed, newDay, used + r.appliedMs, stored.version),
      db
        .prepare("UPDATE bases SET state = ?, version = version + 1, updated_at = ? WHERE account_id = ? AND version = ? AND changes() = 1")
        .bind(JSON.stringify(r.state), ctx.now, account.id, stored.version),
    ])) as { meta: { changes: number } }[];
    if (results[1]?.meta.changes === 1) {
      ctx.deps.analytics.track("speedup", { job, tokens: r.tokensUsed });
      await syncSnapshot(ctx, account, advance(r.state, ctx.now));
      return json({ ok: true, state: r.state, wallet: walletView(await loadWallet(db, account.id), ctx.now), now: ctx.now });
    }
  }
  throw new HttpError("conflict");
};
