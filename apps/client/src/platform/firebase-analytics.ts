import type { Analytics } from "./analytics.ts";
import type { CrashReporter } from "./crash.ts";

/**
 * NOT WRITTEN. Firebase Analytics and Crashlytics need the Capacitor shell, a Firebase project and its
 * `google-services.json` (kept out of git). Steps: docs/release.md, "Analytics and crash reporting".
 */
export const firebaseAnalytics = (): Analytics => {
  throw new Error("Firebase analytics is not configured: see docs/release.md");
};

export const firebaseCrashReporter = (): CrashReporter => {
  throw new Error("Firebase crash reporting is not configured: see docs/release.md");
};
