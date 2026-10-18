import { createBaseState, type BaseState, type UpgradeJob } from "./base-state.ts";
import { BUILDING_IDS, type BuildingId } from "./building-id.ts";
import { M1_IMPORT_MAX_LEVEL } from "./data/m1-import.ts";
import { storageCap } from "./production.ts";
import { mapResources } from "./resources.ts";
import { nextLevelQuote } from "./upgrade.ts";
import { isBaseState } from "./validate-state.ts";

const clampLevels = (levels: BaseState["levels"]): BaseState["levels"] => {
  const hq = Math.min(levels.hq, M1_IMPORT_MAX_LEVEL);
  const out = { ...levels, hq };
  for (const id of BUILDING_IDS) if (id !== "hq") out[id] = Math.min(levels[id], hq);
  return out;
};

/** Keeps a queued upgrade only if it is exactly one the rules could have started by `now`. */
const plausibleJob = (job: UpgradeJob, levels: BaseState["levels"], now: number): UpgradeJob | null => {
  const b: BuildingId = job.building;
  const quote = nextLevelQuote(b, levels[b]);
  if (quote === null || quote.toLevel !== job.toLevel || quote.toLevel > M1_IMPORT_MAX_LEVEL) return null;
  if (b !== "hq" && quote.toLevel > levels.hq) return null;
  if (job.startedAt > now || job.endsAt - job.startedAt !== quote.durationMs) return null;
  return job;
};

/**
 * Turns an untrusted pre-M2 save into a base the server will accept, at server time `now`.
 * Anything malformed gives a fresh base; levels, resources, the queue and timestamps are
 * clamped so a forged save gains at most a small, bounded head start.
 */
export const importM1Save = (candidate: unknown, now: number): BaseState => {
  if (!isBaseState(candidate)) return createBaseState(now);
  const levels = clampLevels(candidate.levels);
  const cap = storageCap(levels.hq);
  return {
    resources: mapResources((id) => Math.min(Math.max(0, candidate.resources[id]), cap[id])),
    levels,
    queue: candidate.queue === null ? null : plausibleJob(candidate.queue, levels, now),
    lastUpdated: Math.min(candidate.lastUpdated, now),
  };
};
