import type { ProductSku } from "@revolt/rules";
import type { BillingVerifier, VerifyContext, VerifyResult } from "./billing.ts";
import { BillingNotConfigured, BillingUnavailable } from "./billing.ts";
import { hashToken } from "../auth/tokens.ts";

/** The only store this verifier accepts. The client sends `provider: "google"` with the Play purchase token. */
export const GOOGLE_PROVIDER = "google";

const RECEIPTS_URL = "https://api.revenuecat.com/v1/receipts";
const PURCHASE_TOKEN = /^[A-Za-z0-9._:-]{16,4096}$/;

export interface RevenueCatOptions {
  readonly secret: string | undefined;
  /** Accept Play sandbox (license tester) purchases. Only for the internal test track. */
  readonly allowSandbox: boolean;
  /** Injected in tests; the Worker's global `fetch` otherwise. */
  readonly fetch?: typeof fetch;
}

type NonSubscription = { readonly id?: unknown; readonly is_sandbox?: unknown; readonly store?: unknown };

/**
 * Server-side receipt checking through RevenueCat's REST API (`POST /v1/receipts`, docs.revenuecat.com/docs/api-v1).
 * RevenueCat checks the Play purchase token with Google and answers with the customer's purchases. The purchase counts
 * when the answer lists the sku under `non_subscriptions` from the Play store. The transaction id is a hash of the
 * purchase token, which Google makes unique per purchase, so the store handler's once-per-transaction rule holds.
 *
 * RevenueCat never sees an account id: `app_user_id` is a hash of it. The secret comes from the Worker's environment
 * (`wrangler secret put REVENUECAT_SECRET`), never from the repo.
 */
export const revenueCatBilling = (opts: RevenueCatOptions): BillingVerifier => {
  const secret = opts.secret ?? "";
  if (secret.length === 0) {
    return {
      kind: "revenuecat",
      configured: false,
      verify: async () => {
        throw new BillingNotConfigured("REVENUECAT_SECRET is not set");
      },
    };
  }
  const doFetch = opts.fetch ?? fetch;
  return {
    kind: "revenuecat",
    configured: true,
    verify: async (provider: string, sku: ProductSku, receipt: string, ctx: VerifyContext): Promise<VerifyResult> => {
      if (provider !== GOOGLE_PROVIDER || !PURCHASE_TOKEN.test(receipt)) return { ok: false };
      let res: Response;
      try {
        res = await doFetch(RECEIPTS_URL, {
          method: "POST",
          headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", "x-platform": "android" },
          body: JSON.stringify({ app_user_id: await hashToken(`rc:${ctx.accountId}`), fetch_token: receipt, product_id: sku }),
        });
      } catch {
        throw new BillingUnavailable("RevenueCat unreachable");
      }
      // 5xx and 429: RevenueCat or Google is having trouble; the client keeps the purchase and retries later.
      if (res.status >= 500 || res.status === 429) throw new BillingUnavailable(`RevenueCat answered ${res.status}`);
      // A bad API key is our mistake, not the player's: refuse to sell rather than call the receipt bad.
      if (res.status === 401 || res.status === 403) throw new BillingNotConfigured(`RevenueCat refused the key (${res.status})`);
      if (!res.ok) return { ok: false };
      const entries = purchasesOf(await res.json().catch(() => null), sku);
      const found = entries.some((e) => (e.store === undefined || e.store === "play_store") && (opts.allowSandbox || e.is_sandbox !== true));
      return found ? { ok: true, txnId: `gp_${(await hashToken(receipt)).slice(0, 48)}` } : { ok: false };
    },
  };
};

/** `value.subscriber.non_subscriptions[sku]` (some answers omit `value`), or nothing when the shape is off. */
const purchasesOf = (body: unknown, sku: ProductSku): readonly NonSubscription[] => {
  const root = asRecord(body);
  const subscriber = asRecord(asRecord(root?.["value"])?.["subscriber"] ?? root?.["subscriber"]);
  const list = asRecord(subscriber?.["non_subscriptions"])?.[sku];
  return Array.isArray(list) ? list.filter((e): e is NonSubscription => asRecord(e) !== null) : [];
};

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
