import type { BaseState } from "./base-state.ts";
import { accrue } from "./production.ts";

/**
 * Brings the state up to `now`: settles production and resolves a finished
 * upgrade lazily. Production before the upgrade's end uses the old level,
 * production after it uses the new one.
 */
export const advance = (state: BaseState, now: number): BaseState => {
  let s = state;
  const job = s.queue;
  if (job !== null && job.endsAt <= now) {
    s = accrue(s, job.endsAt);
    s = { ...s, levels: { ...s.levels, [job.building]: job.toLevel }, queue: null };
  }
  return accrue(s, now);
};
