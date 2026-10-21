import {
  COSMETIC_SLOTS,
  isCosmeticId,
  isProductSku,
  MAX_SPEEDUP_TOKENS_HELD,
  passSeasonAt,
  PRODUCT_SKUS,
  PRODUCTS,
  SPEEDUP_DAILY_CAP_MS,
  slotOf,
  usedToday,
  utcDay,
  DAY_MS,
  type ProductView,
  type StoreBlockReason,
  type StoreView,
  type WalletView,
} from "@revolt/rules";
import { BillingNotConfigured } from "../billing/billing.ts";
import { hashToken } from "../auth/tokens.ts";
import { runGrant } from "../db/grants.ts";
import { takeGuestSlot } from "../db/guest-rate.ts";
import { isUniqueViolation } from "../db/db.ts";
import { equipCosmetic, loadCosmetics, loadPass, loadWallet } from "../db/live.ts";
import { HttpError, json, readJson } from "../http.ts";
import { authenticate, type Ctx } from "./context.ts";
import { backgroundOf } from "./live-support.ts";

/** Redeem attempts one account may make per hour, whatever the outcome. */
const REDEEM_PER_HOUR = 20;

const refuse = (ctx: Ctx, reason: StoreBlockReason): Response => json({ ok: false, reason, now: ctx.now });

export const walletView = (w: { tokens: number; day: number; usedMs: number }, now: number): WalletView => ({
  speedupTokens: Math.min(w.tokens, MAX_SPEEDUP_TOKENS_HELD),
  usedTodayMs: usedToday(w.day, w.usedMs, now),
  dailyCapMs: SPEEDUP_DAILY_CAP_MS,
});

/** GET /v1/store — the catalog, the wallet and the cosmetics. Prices are hints; the store shows the real ones. */
export const getStore = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const [wallet, cosmetics, pass] = await Promise.all([loadWallet(ctx.env.DB, account.id), loadCosmetics(ctx.env.DB, account.id), loadPass(ctx.env.DB, account.id, ctx.now)]);
  const products: ProductView[] = PRODUCT_SKUS.map((sku) => {
    const p = PRODUCTS[sku];
    const owned = (p.passPremium === true && pass.progress.premium) || (p.grants.cosmetic !== undefined && cosmetics.owned.includes(p.grants.cosmetic));
    return { sku, kind: p.kind, priceHintUsdCents: p.priceHintUsdCents, owned, dailyLimit: p.dailyLimit ?? null };
  });
  const body: StoreView = { products, wallet: walletView(wallet, ctx.now), cosmetics, canRedeem: ctx.deps.billing(ctx.env).configured, now: ctx.now };
  return json(body);
};

/**
 * POST /v1/store/redeem `{ sku, provider, receipt }` — checks the receipt with the billing verifier and, once per store
 * transaction, hands out what the product grants. A repeat of a granted transaction answers `duplicate: true` and
 * grants nothing. Nothing in the request but the sku and the receipt matters.
 */
export const postRedeem = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const b = await readJson(ctx.req);
  if (!isProductSku(b.sku) || typeof b.provider !== "string" || typeof b.receipt !== "string" || b.provider.length > 32 || b.receipt.length > 4096) {
    throw new HttpError("bad_request");
  }
  const db = ctx.env.DB;
  if (!(await takeGuestSlot(db, await hashToken(`redeem:${account.id}`), ctx.now, REDEEM_PER_HOUR))) throw new HttpError("rate_limited");
  let verified;
  try {
    verified = await ctx.deps.billing(ctx.env).verify(b.provider, b.sku, b.receipt);
  } catch (e) {
    if (e instanceof BillingNotConfigured) throw new HttpError("billing_not_configured");
    throw e;
  }
  if (!verified.ok) return refuse(ctx, "bad_receipt");
  const product = PRODUCTS[b.sku];
  const txn = await db.prepare("SELECT account_id, sku FROM purchases WHERE provider = ? AND provider_txn = ?").bind(b.provider, verified.txnId).first<{ account_id: string; sku: string }>();
  if (txn !== null) return txn.account_id === account.id && txn.sku === b.sku ? json({ ok: true, duplicate: true, now: ctx.now }) : refuse(ctx, "bad_receipt");

  const season = passSeasonAt(ctx.now).index;
  const [cosmetics, pass] = await Promise.all([loadCosmetics(db, account.id), loadPass(db, account.id, ctx.now)]);
  if ((product.passPremium === true && pass.progress.premium) || (product.grants.cosmetic !== undefined && cosmetics.owned.includes(product.grants.cosmetic))) {
    return refuse(ctx, "already_owned");
  }
  if (product.dailyLimit !== undefined) {
    const n = await db.prepare("SELECT COUNT(*) AS n FROM purchases WHERE account_id = ? AND sku = ? AND created_at >= ?").bind(account.id, b.sku, utcDay(ctx.now) * DAY_MS).first<{ n: number }>();
    if ((n?.n ?? 0) >= product.dailyLimit) return refuse(ctx, "daily_limit");
  }
  const sku = b.sku;
  const dayStartMs = utcDay(ctx.now) * DAY_MS;
  // The same limit again, inside the grant batch, so two concurrent redeems cannot both slip under it.
  const admit =
    product.dailyLimit === undefined
      ? undefined
      : { sql: "(SELECT COUNT(*) FROM purchases WHERE account_id = ? AND sku = ? AND created_at >= ?) < ?", binds: [account.id, sku, dayStartMs, product.dailyLimit] };
  const provider = b.provider;
  const txnId = verified.txnId;
  try {
    const g = await runGrant(db, {
      accountId: account.id,
      claimKey: `purchase:${provider}:${txnId}`,
      now: ctx.now,
      background: backgroundOf(account),
      reward: product.grants,
      ...(admit === undefined ? {} : { admit }),
      extra: (guard) => [
        db
          .prepare(`INSERT INTO purchases (id, account_id, sku, provider, provider_txn, status, created_at) SELECT ?, ?, ?, ?, ?, 'granted', ? WHERE ${guard.sql}`)
          .bind(crypto.randomUUID(), account.id, sku, provider, txnId, ctx.now, ...guard.binds),
        ...(product.passPremium === true
          ? [db.prepare(`INSERT OR IGNORE INTO pass_premium (account_id, season) SELECT ?, ? WHERE ${guard.sql}`).bind(account.id, season, ...guard.binds)]
          : []),
      ],
    });
    if (g.kind === "duplicate") return json({ ok: true, duplicate: true, now: ctx.now });
    if (g.kind === "refused") return refuse(ctx, "daily_limit");
    if (g.kind === "conflict") throw new HttpError("conflict");
    ctx.deps.analytics.track("purchase", { sku });
    return json({ ok: true, duplicate: false, ...(g.state === null ? {} : { state: g.state }), now: ctx.now });
  } catch (e) {
    // Another account redeemed the same store transaction between our lookup and our batch.
    if (isUniqueViolation(e)) return refuse(ctx, "bad_receipt");
    throw e;
  }
};

/** POST /v1/cosmetics/equip `{ slot, cosmetic }` — wears an owned cosmetic, or empties the slot with `cosmetic: null`. */
export const postEquip = async (ctx: Ctx): Promise<Response> => {
  const { account } = await authenticate(ctx);
  const b = await readJson(ctx.req);
  const slot = COSMETIC_SLOTS.find((s) => s === b.slot);
  const id = b.cosmetic === null ? null : isCosmeticId(b.cosmetic) ? b.cosmetic : undefined;
  if (slot === undefined || id === undefined || (id !== null && slotOf(id) !== slot)) throw new HttpError("bad_request");
  if (!(await equipCosmetic(ctx.env.DB, account.id, slot, id))) return refuse(ctx, "not_owned");
  return json({ ok: true, cosmetics: await loadCosmetics(ctx.env.DB, account.id), now: ctx.now });
};
