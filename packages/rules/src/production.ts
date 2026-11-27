import type { BaseState } from "./base-state.ts";
import { BUILDING_IDS, type BuildingId } from "./building-id.ts";
import { BUILDINGS } from "./data/buildings.ts";
import { STORAGE_CAPS } from "./data/storage.ts";
import { multiplierBreakpoints, productionMultiplier, type World } from "./liberation.ts";
import { mapResources, ZERO_RESOURCES, type Resources } from "./resources.ts";
import { lessonBonus } from "./effects.ts";

const MS_PER_HOUR = 3_600_000;

const levelRow = <T>(rows: readonly T[], level: number): T => {
  const row = rows[Math.min(Math.max(level, 1), rows.length) - 1];
  if (row === undefined) throw new Error(`empty table`);
  return row;
};

export const storageCap = (hqLevel: number): Resources => levelRow(STORAGE_CAPS, hqLevel);

/** The storage cap of a base: the HQ's, raised by the weavers' storage lessons (rounded down). */
export const storageCapFor = (state: Pick<BaseState, "levels" | "lessons">): Resources => {
  const base = storageCap(state.levels.hq);
  const more = 1 + lessonBonus(state, "storage");
  return mapResources((id) => Math.floor(base[id] * more));
};

/** Hourly output of a base: the buildings' production, with the messengers' support lesson on popular support. */
export const productionFor = (state: Pick<BaseState, "levels" | "lessons">, multiplier: number): Resources => {
  const rate = productionPerHour(state.levels, multiplier);
  return { ...rate, support: rate.support * (1 + lessonBonus(state, "support_rate")) };
};

/** Hourly output at the given levels; `multiplier` is the server-wide bonus (see `productionMultiplier`). */
export const productionPerHour = (levels: Readonly<Record<BuildingId, number>>, multiplier: number): Resources => {
  const out = { ...ZERO_RESOURCES };
  for (const id of BUILDING_IDS) {
    const def = BUILDINGS[id];
    if (def.produces !== null) out[def.produces] += levelRow(def.levels, levels[id]).ratePerHour * multiplier;
  }
  return out;
};

/**
 * Settles production from `state.lastUpdated` to `t` at the current levels, in segments
 * split wherever the server-wide bonus changes. Time before `lastUpdated` is never paid,
 * even if a liberation started earlier. `t` earlier than `lastUpdated` is a no-op: time never
 * runs backwards. Amounts already above the cap are kept, never clamped down.
 */
export const accrue = (state: BaseState, t: number, world: World): BaseState => {
  if (!(t - state.lastUpdated > 0)) return state;
  const cap = storageCapFor(state);
  const edges = [state.lastUpdated, ...multiplierBreakpoints(world, state.lastUpdated, t), t];
  let resources = state.resources;
  for (let i = 0; i + 1 < edges.length; i++) {
    const start = edges[i] ?? t;
    const dt = (edges[i + 1] ?? t) - start;
    const rate = productionFor(state, productionMultiplier(world, start));
    const before = resources;
    resources = mapResources((id) => {
      const stored = before[id];
      if (stored >= cap[id]) return stored;
      return Math.min(cap[id], stored + (rate[id] * dt) / MS_PER_HOUR);
    });
  }
  return { ...state, resources, lastUpdated: t };
};
