import type { ProductSku } from "@revolt/rules";

/** What buying a product on this device came to. */
export type PurchaseResult =
  | { readonly kind: "receipt"; readonly provider: string; readonly receipt: string }
  | { readonly kind: "cancelled" }
  /** No billing in this build: the store is shown but nothing can be bought. */
  | { readonly kind: "unavailable" };

/**
 * The device side of a purchase. It only ever produces a receipt; the server checks it and grants (`POST /v1/store/redeem`).
 * The real implementation (Google Play Billing through RevenueCat) needs a Capacitor shell and store accounts, so it
 * is a release-time step (docs/release.md).
 */
export interface Billing {
  /** Whether `purchase` can work in this build. */
  readonly available: boolean;
  readonly purchase: (sku: ProductSku) => Promise<PurchaseResult>;
}

/** The default: the store is browse-only. */
export const noopBilling: Billing = { available: false, purchase: async () => ({ kind: "unavailable" }) };

let counter = 0;

/**
 * Test billing for local development and the e2e build (`VITE_BILLING_MOCK=1`): returns a receipt the e2e Worker's test
 * verifier accepts. A release build never sets that flag, and the deployed Worker has no such verifier, so even a
 * build with the flag could not buy anything there.
 */
export const devBilling = (random: () => number = Math.random): Billing => ({
  available: true,
  purchase: async (sku) => ({
    kind: "receipt",
    provider: "local",
    receipt: `local-test:${sku}-${Math.floor(random() * 1e9).toString(36)}-${++counter}`,
  }),
});
