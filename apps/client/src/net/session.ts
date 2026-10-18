export const SESSION_KEY = "revolt.session";

/** The device's bearer token. It is the only game data kept on the device. */
export const loadSession = (storage: Storage): string | null => {
  try {
    return storage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};

export const storeSession = (storage: Storage, token: string): void => {
  try {
    storage.setItem(SESSION_KEY, token);
  } catch {
    // Blocked storage: the session lasts until the app closes.
  }
};
