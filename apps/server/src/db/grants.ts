import { grantReward, MAX_SPEEDUP_TOKENS_HELD, rewardHasBaseParts, type BackgroundId, type BaseState, type Reward } from "@revolt/rules";
import { loadBase } from "./bases.ts";
import type { Db, DbStatement } from "./db.ts";

/**
 * One-time grants (event rewards, pass tiers, purchases) behind a claim row. The claim's `granted` column is the lock:
 * 0 = claimed but nothing handed out, 2 = inside this batch, 1 = done. One D1 batch does everything, and every
 * statement after the first is a no-op unless the previous steps took effect:
 *
 *   1. insert the claim (ignored if it exists)
 *   2. save the base with the reward, compare-and-set on its version, only while the claim is 0
 *   3. mark the claim 2 if step 2 changed a row (`changes()`), or unconditionally when there is no base part
 *   4. tokens, cosmetics and `extra` statements, each only while the claim is 2
 *   5. mark the claim 1
 *
 * A lost compare-and-set therefore leaves the claim at 0 and nothing granted, and the loop tries again from a fresh
 * base; a second concurrent grant finds the claim at 1 and grants nothing.
 */
export interface GrantPlan {
  readonly accountId: string;
  /** Unique per one-time grant, e.g. `event:supply_route:3`. */
  readonly claimKey: string;
  readonly now: number;
  readonly background: BackgroundId;
  readonly reward: Reward;
  /**
   * A SQL condition (with its binds) that must hold at the moment the claim is taken, evaluated inside the batch so a
   * limit cannot be raced past. When it fails nothing is granted and the result is `refused`.
   */
  readonly admit?: { readonly sql: string; readonly binds: (string | number)[] };
  /** More statements for step 4. `guard` is a SQL condition (with its binds) true only inside the batch. */
  readonly extra?: (guard: { readonly sql: string; readonly binds: (string | number)[] }) => DbStatement[];
}

export type GrantResult =
  | { readonly kind: "granted"; readonly state: BaseState | null }
  | { readonly kind: "duplicate" }
  | { readonly kind: "refused" }
  | { readonly kind: "conflict" };

const ATTEMPTS = 4;

export const runGrant = async (db: Db, plan: GrantPlan): Promise<GrantResult> => {
  const { accountId, claimKey: key, now, reward } = plan;
  const needsBase = rewardHasBaseParts(reward);
  const admitSql = plan.admit === undefined ? "" : ` AND ${plan.admit.sql}`;
  const admitBinds = plan.admit?.binds ?? [];
  for (let i = 0; i < ATTEMPTS; i++) {
    const done = await db.prepare("SELECT granted FROM claims WHERE account_id = ? AND key = ?").bind(accountId, key).first<{ granted: number }>();
    if (done?.granted === 1) return { kind: "duplicate" };
    let next: BaseState | null = null;
    let version = 0;
    if (needsBase) {
      const stored = await loadBase(db, accountId);
      if (stored === null) return { kind: "conflict" };
      next = grantReward(stored.state, reward, now, plan.background);
      version = stored.version;
    }
    const inBatch = { sql: "EXISTS (SELECT 1 FROM claims WHERE account_id = ? AND key = ? AND granted = 2)", binds: [accountId, key] as (string | number)[] };
    const stmts: DbStatement[] = [db.prepare("INSERT OR IGNORE INTO claims (account_id, key, granted, at) VALUES (?, ?, 0, ?)").bind(accountId, key, now)];
    if (next !== null) {
      stmts.push(
        db
          .prepare(
            `UPDATE bases SET state = ?, version = version + 1, updated_at = ? WHERE account_id = ? AND version = ?
             AND EXISTS (SELECT 1 FROM claims WHERE account_id = ? AND key = ? AND granted = 0)${admitSql}`,
          )
          .bind(JSON.stringify(next), now, accountId, version, accountId, key, ...admitBinds),
        db.prepare("UPDATE claims SET granted = 2 WHERE account_id = ? AND key = ? AND granted = 0 AND changes() = 1").bind(accountId, key),
      );
    } else {
      stmts.push(db.prepare(`UPDATE claims SET granted = 2 WHERE account_id = ? AND key = ? AND granted = 0${admitSql}`).bind(accountId, key, ...admitBinds));
    }
    const tokens = Math.floor(reward.speedupTokens ?? 0);
    if (tokens > 0) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO wallet (account_id, speedup_tokens) SELECT ?, ? WHERE ${inBatch.sql}
             ON CONFLICT (account_id) DO UPDATE SET speedup_tokens = MIN(wallet.speedup_tokens + excluded.speedup_tokens, ?)`,
          )
          .bind(accountId, tokens, ...inBatch.binds, MAX_SPEEDUP_TOKENS_HELD),
      );
    }
    if (reward.cosmetic !== undefined) {
      stmts.push(
        db.prepare(`INSERT OR IGNORE INTO cosmetics (account_id, cosmetic, equipped) SELECT ?, ?, 0 WHERE ${inBatch.sql}`).bind(accountId, reward.cosmetic, ...inBatch.binds),
      );
    }
    if (plan.extra !== undefined) stmts.push(...plan.extra(inBatch));
    stmts.push(db.prepare("UPDATE claims SET granted = 1 WHERE account_id = ? AND key = ? AND granted = 2").bind(accountId, key));
    const results = (await db.batch(stmts)) as { meta: { changes: number } }[];
    if (results[results.length - 1]?.meta.changes === 1) return { kind: "granted", state: next };
    if (plan.admit !== undefined && (await db.prepare(`SELECT 1 AS x WHERE ${plan.admit.sql}`).bind(...plan.admit.binds).first()) === null) return { kind: "refused" };
  }
  return { kind: "conflict" };
};
