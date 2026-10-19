import type { BaseState } from "./base-state.ts";

export const HELP_KINDS = ["upgrade", "training"] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

export const isHelpKind = (v: unknown): v is HelpKind => HELP_KINDS.some((k) => k === v);

export interface HelpableJob {
  readonly startedAt: number;
  readonly endsAt: number;
}

/** The running job of this kind on an already-advanced state, or null (nothing running, or already finished by `now`). */
export const helpableJob = (state: BaseState, kind: HelpKind, now: number): HelpableJob | null => {
  const job = kind === "upgrade" ? state.queue : state.training;
  return job === null || job.endsAt <= now ? null : { startedAt: job.startedAt, endsAt: job.endsAt };
};

/**
 * Moves a running job's end earlier by `ms`, never before `now`, the job's start, or the time already
 * settled (so time going backwards cannot undo anything). `state` must be advanced to `now`.
 */
export const reduceJob = (state: BaseState, kind: HelpKind, ms: number, now: number): { state: BaseState; changed: boolean } => {
  const job = helpableJob(state, kind, now);
  if (job === null || !(ms > 0)) return { state, changed: false };
  const floor = Math.max(now, state.lastUpdated, job.startedAt);
  const endsAt = Math.max(job.endsAt - ms, floor);
  if (endsAt >= job.endsAt) return { state, changed: false };
  return kind === "upgrade" && state.queue !== null
    ? { state: { ...state, queue: { ...state.queue, endsAt } }, changed: true }
    : state.training !== null
      ? { state: { ...state, training: { ...state.training, endsAt } }, changed: true }
      : { state, changed: false };
};
