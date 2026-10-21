export interface CrashReporter {
  readonly capture: (error: unknown, where?: string) => void;
}

export const noopCrashReporter: CrashReporter = { capture: () => undefined };

export const consoleCrashReporter: CrashReporter = { capture: (error, where) => console.error(`crash${where === undefined ? "" : ` (${where})`}:`, error) };

/** As `withConsent` for analytics: reports go out only while the player consents. */
export const reportWithConsent = (inner: CrashReporter, consented: () => boolean): CrashReporter => ({
  capture: (error, where) => {
    if (consented()) inner.capture(error, where);
  },
});

/** The window events that carry otherwise silent failures to the reporter. Returns a function that removes them. */
export const installCrashHooks = (reporter: CrashReporter, target: Pick<Window, "addEventListener" | "removeEventListener">): (() => void) => {
  const onError = (e: Event): void => reporter.capture((e as ErrorEvent).error ?? (e as ErrorEvent).message, "window.onerror");
  const onRejection = (e: Event): void => reporter.capture((e as PromiseRejectionEvent).reason, "unhandledrejection");
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
};
