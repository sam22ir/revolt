import { isBaseState, type BaseState } from "@revolt/rules";

export const SAVE_KEY = "revolt.save";
export const SAVE_VERSION = 1;

interface SaveFile {
  readonly version: number;
  readonly state: BaseState;
}

/** Parses a save string; returns null when missing, corrupt or from another version. */
export const parseSave = (raw: string | null): BaseState | null => {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("version" in parsed) || !("state" in parsed) || parsed.version !== SAVE_VERSION || !isBaseState(parsed.state)) return null;
    return parsed.state;
  } catch {
    return null;
  }
};

export const serializeSave = (state: BaseState): string =>
  JSON.stringify({ version: SAVE_VERSION, state } satisfies SaveFile);

export const loadState = (storage: Storage): BaseState | null => {
  try {
    return parseSave(storage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
};

export const storeState = (storage: Storage, state: BaseState): void => {
  try {
    storage.setItem(SAVE_KEY, serializeSave(state));
  } catch {
    // Storage full or blocked (private mode): the game keeps running unsaved.
  }
};
