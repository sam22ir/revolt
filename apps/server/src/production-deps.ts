import { googleRemoteKeys } from "./auth/google.ts";
import { revenueCatBilling } from "./billing/revenuecat-billing.ts";
import type { Deps } from "./env.ts";
import { durableRoom } from "./alliance/room-client.ts";
import { durableMap } from "./map/map-client.ts";
import { noAnalytics, noCrashReporter } from "./telemetry.ts";

/**
 * What the deployed Worker runs with. Kept apart from `index.ts` (which exports the Durable Object classes) so tests
 * can import it. No test billing here, on purpose: the free test verifier belongs to the e2e entry only.
 */
export const productionDeps: Deps = {
  now: () => Date.now(),
  googleKeys: googleRemoteKeys(),
  map: durableMap,
  room: durableRoom,
  billing: (env) => revenueCatBilling(env.REVENUECAT_SECRET),
  analytics: noAnalytics,
  crash: noCrashReporter,
};
