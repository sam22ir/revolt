import type { Billing } from "./billing.ts";

/**
 * NOT WRITTEN. The real Billing is Google Play Billing through RevenueCat's Capacitor plugin. It needs the Capacitor
 * Android shell (not in the repo yet), a Play Console app with products named like `PRODUCTS` in
 * `packages/rules/src/data/store.ts`, and a RevenueCat project. Steps: docs/release.md, "Billing".
 * Until then a build that selects this adapter fails loudly instead of selling nothing quietly.
 */
export const revenueCatBilling = (): Billing => {
  throw new Error("RevenueCat billing is not configured: see docs/release.md");
};
