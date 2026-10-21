import type { ProductSku } from "@revolt/rules";

/** The outcome of checking a purchase receipt with the store. `txnId` is the store's id for the transaction. */
export type VerifyResult = { readonly ok: true; readonly txnId: string } | { readonly ok: false };

/** Thrown when this deployment cannot check receipts at all (no secret, no provider). The API answers 503. */
export class BillingNotConfigured extends Error {
  constructor(detail: string) {
    super(`billing_not_configured: ${detail}`);
  }
}

/**
 * Checks receipts. The Worker never trusts a client's word that something was bought: `POST /v1/store/redeem` grants
 * only what a verifier confirms, once per store transaction.
 */
export interface BillingVerifier {
  readonly kind: "none" | "local" | "revenuecat";
  /** Whether `verify` can work at all in this deployment. */
  readonly configured: boolean;
  verify(provider: string, sku: ProductSku, receipt: string): Promise<VerifyResult>;
}

/** What a deployment without billing uses: the store is browse-only. */
export const noBilling: BillingVerifier = {
  kind: "none",
  configured: false,
  verify: async () => {
    throw new BillingNotConfigured("no verifier");
  },
};
