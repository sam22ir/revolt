/**
 * Analytics and crash reporting hooks (M7). The server only ever sends event names and small counters: never an
 * account id, a handle, an email or a receipt. The real sinks (Firebase, Sentry, ...) are a release-time decision
 * (docs/release.md); until then both default to doing nothing.
 */
export type Props = Readonly<Record<string, string | number | boolean>>;

export interface Analytics {
  track(event: string, props?: Props): void;
}

export interface CrashReporter {
  capture(error: unknown, context?: Props): void;
}

export const noAnalytics: Analytics = { track: () => undefined };
export const noCrashReporter: CrashReporter = { capture: () => undefined };

/** For local development: prints events instead of sending them. */
export const consoleAnalytics: Analytics = { track: (event, props) => console.log(`analytics: ${event}`, props ?? {}) };
export const consoleCrashReporter: CrashReporter = { capture: (error, context) => console.error("crash:", error, context ?? {}) };
