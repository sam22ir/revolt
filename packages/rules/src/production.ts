import type { BaseState } from "./base-state.ts";
import { BUILDING_IDS, type BuildingId } from "./building-id.ts";
import { BUILDINGS } from "./data/buildings.ts";
import { STORAGE_CAPS } from "./data/storage.ts";
import { mapResources, ZERO_RESOURCES, type Resources } from "./resources.ts";

const MS_PER_HOUR = 3_600_000;

const levelRow = <T>(rows: readonly T[], level: number): T => {
  const row = rows[Math.min(Math.max(level, 1), rows.length) - 1];
  if (row === undefined) throw new Error(`empty table`);
  return row;
};

export const storageCap = (hqLevel: number): Resources => levelRow(STORAGE_CAPS, hqLevel);

export const productionPerHour = (levels: Readonly<Record<BuildingId, number>>): Resources => {
  const out = { ...ZERO_RESOURCES };
  for (const id of BUILDING_IDS) {
    const def = BUILDINGS[id];
    out[def.produces] += levelRow(def.levels, levels[id]).ratePerHour;
  }
  return out;
};

/**
 * Settles production from `state.lastUpdated` to `t` at the current levels.
 * `t` earlier than `lastUpdated` is a no-op: time never runs backwards.
 * Amounts already above the cap are kept, never clamped down.
 */
export const accrue = (state: BaseState, t: number): BaseState => {
  const dt = t - state.lastUpdated;
  if (!(dt > 0)) return state;
  const rate = productionPerHour(state.levels);
  const cap = storageCap(state.levels.hq);
  const resources = mapResources((id) => {
    const stored = state.resources[id];
    if (stored >= cap[id]) return stored;
    return Math.min(cap[id], stored + (rate[id] * dt) / MS_PER_HOUR);
  });
  return { ...state, resources, lastUpdated: t };
};
