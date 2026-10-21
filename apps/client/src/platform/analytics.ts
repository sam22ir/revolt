export type Props = Readonly<Record<string, string | number | boolean>>;

/**
 * Product analytics hook. Event names and small props only: never an account id, handle, email or token.
 * The real sink (Firebase Analytics) needs a Capacitor shell and a Firebase project (docs/release.md).
 */
export interface Analytics {
  readonly track: (event: string, props?: Props) => void;
}

export const noopAnalytics: Analytics = { track: () => undefined };

/** For development: prints events instead of sending them. */
export const consoleAnalytics: Analytics = { track: (event, props) => console.log(`analytics: ${event}`, props ?? {}) };

/** Passes events on only while the player has consented; asked on every event, so switching it off takes effect at once. */
export const withConsent = (inner: Analytics, consented: () => boolean): Analytics => ({
  track: (event, props) => {
    if (consented()) inner.track(event, props);
  },
});
