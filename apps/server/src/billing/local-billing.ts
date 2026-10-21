import type { BillingVerifier } from "./billing.ts";

/**
 * Test billing: accepts a receipt of the form `local-test:<txn>` from provider "local" and nothing else. It grants
 * purchases for free, so it must NEVER be wired into the deployed Worker. It exists only in `e2e-entry.ts` and in the
 * test harness; `test/billing.test.ts` checks that `production-deps.ts` and `index.ts` do not mention it.
 */
export const localBilling: BillingVerifier = {
  kind: "local",
  configured: true,
  verify: async (provider, _sku, receipt) => {
    const m = provider === "local" ? /^local-test:([A-Za-z0-9_-]{4,64})$/.exec(receipt) : null;
    return m === null || m[1] === undefined ? { ok: false } : { ok: true, txnId: m[1] };
  },
};
