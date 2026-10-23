import { tileDistance, type MapNpcView, type MapPoint } from "@revolt/rules";

/**
 * The next target of `level` after `afterId`, nearest to `from` first (the same distance a march's travel time uses,
 * so "nearest" means "shortest march"). Ties go to the lower id. Past the last one it wraps to the nearest again; an
 * `afterId` that is not on the map any more (the NPC died, or respawned under a new id) starts from the nearest.
 * Null when no target of that level is alive.
 */
export const nextTarget = (npcs: readonly MapNpcView[], from: MapPoint, level: number, afterId: string | null): MapNpcView | null => {
  const sorted = npcs
    .filter((n) => n.level === level)
    .map((n) => ({ n, d: tileDistance(from, n) }))
    .sort((a, b) => a.d - b.d || (a.n.id < b.n.id ? -1 : a.n.id > b.n.id ? 1 : 0))
    .map((e) => e.n);
  if (sorted.length === 0) return null;
  const i = afterId === null ? -1 : sorted.findIndex((n) => n.id === afterId);
  return sorted[(i + 1) % sorted.length] ?? null;
};
