const KEY = "revolt.analytics";

/**
 * Whether the player agreed to analytics and crash reports. Off until they switch it on: no consent text has been
 * reviewed yet (docs/release.md), so nothing is sent by default. Storage may be blocked; then it stays off.
 */
export const loadConsent = (storage: Pick<Storage, "getItem">): boolean => {
  try {
    return storage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export const storeConsent = (storage: Pick<Storage, "setItem">, on: boolean): void => {
  try {
    storage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Blocked storage: the choice just does not persist.
  }
};
