import { BUILDING_IDS, MAX_BUILDING_LEVEL, RESOURCE_IDS, type BaseState } from "@revolt/rules";

export const SAVE_KEY = "revolt.save";
export const SAVE_VERSION = 1;

interface SaveFile {
  readonly version: number;
  readonly state: BaseState;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const isLevel = (v: unknown): boolean => isFiniteNumber(v) && Number.isInteger(v) && v >= 1 && v <= MAX_BUILDING_LEVEL;

export const isBaseState = (v: unknown): v is BaseState => {
  if (!isRecord(v) || !isRecord(v.resources) || !isRecord(v.levels) || !isFiniteNumber(v.lastUpdated)) return false;
  const { resources, levels, queue } = v;
  if (!RESOURCE_IDS.every((id) => isFiniteNumber(resources[id]) && resources[id] >= 0)) return false;
  if (!BUILDING_IDS.every((id) => isLevel(levels[id]))) return false;
  if (queue === null) return true;
  return (
    isRecord(queue) &&
    BUILDING_IDS.some((id) => id === queue.building) &&
    isLevel(queue.toLevel) &&
    isFiniteNumber(queue.startedAt) &&
    isFiniteNumber(queue.endsAt)
  );
};

/** Parses a save string; returns null when missing, corrupt or from another version. */
export const parseSave = (raw: string | null): BaseState | null => {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SAVE_VERSION || !isBaseState(parsed.state)) return null;
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
