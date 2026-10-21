import type { BillingVerifier } from "./billing.ts";
import { BillingNotConfigured } from "./billing.ts";

/**
 * Server-side receipt checking through RevenueCat's REST API. NOT IMPLEMENTED: it needs a RevenueCat project, a Play
 * Console app and products, none of which exist yet (docs/release.md, "Billing"). Until then it refuses to verify
 * anything, so a production deploy sells nothing rather than selling for free. The secret comes from the Worker's
 * environment (`wrangler secret put REVENUECAT_SECRET`), never from the repo.
 */
export const revenueCatBilling = (secret: string | undefined): BillingVerifier => ({
  kind: "revenuecat",
  configured: false,
  verify: async () => {
    throw new BillingNotConfigured(secret === undefined || secret.length === 0 ? "REVENUECAT_SECRET is not set" : "RevenueCat verification is not implemented yet");
  },
});
