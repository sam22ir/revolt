import { consoleAnalytics, noopAnalytics, withConsent, type Analytics } from "./analytics.ts";
import { devBilling, noopBilling, type Billing } from "./billing.ts";
import { loadConsent, storeConsent } from "./consent.ts";
import { consoleCrashReporter, noopCrashReporter, reportWithConsent, type CrashReporter } from "./crash.ts";

export interface Platform {
  readonly billing: Billing;
  /** Already gated by consent. */
  readonly analytics: Analytics;
  /** Already gated by consent. */
  readonly crash: CrashReporter;
  readonly consent: { readonly get: () => boolean; readonly set: (on: boolean) => void };
}

export interface PlatformOptions {
  /** `VITE_BILLING_MOCK=1`: test billing. */
  readonly billingMock: boolean;
  /** `import.meta.env.DEV`: print analytics and crashes instead of dropping them. */
  readonly dev: boolean;
  readonly storage: Pick<Storage, "getItem" | "setItem">;
}

/**
 * The one place that decides which implementations this build uses. Today: no-ops (console in development), and test
 * billing only when the flag says so. A release swaps in the real adapters here, and nowhere else.
 */
export const createPlatform = (opts: PlatformOptions): Platform => {
  let consented = loadConsent(opts.storage);
  const consent = {
    get: () => consented,
    set: (on: boolean) => {
      consented = on;
      storeConsent(opts.storage, on);
    },
  };
  return {
    billing: opts.billingMock ? devBilling() : noopBilling,
    analytics: withConsent(opts.dev ? consoleAnalytics : noopAnalytics, consent.get),
    crash: reportWithConsent(opts.dev ? consoleCrashReporter : noopCrashReporter, consent.get),
    consent,
  };
};
