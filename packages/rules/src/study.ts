import { advance } from "./advance.ts";
import type { BaseState } from "./base-state.ts";
import { ACADEMY_LEVEL_FOR, STUDY_COST, STUDY_MS } from "./data/academy.ts";
import { isLessonId, LESSONS, type LessonId } from "./data/villages.ts";
import type { World } from "./liberation.ts";
import { canAfford, subtractResources, type Resources } from "./resources.ts";

export const STUDY_BLOCK_REASONS = ["unknown_lesson", "not_taught", "already_studied", "study_busy", "academy_level", "insufficient"] as const;
export type StudyBlockReason = (typeof STUDY_BLOCK_REASONS)[number];

export type StudyResult =
  | { readonly ok: true; readonly state: BaseState }
  | { readonly ok: false; readonly reason: StudyBlockReason; readonly state: BaseState };

/** What studying `lesson` costs and takes, and the academy level it needs (by the lesson's level). */
export const studyQuote = (lesson: LessonId): { cost: Resources; durationMs: number; academyLevel: number } => {
  const level = LESSONS[lesson].level;
  return { cost: STUDY_COST[level], durationMs: STUDY_MS[level], academyLevel: ACADEMY_LEVEL_FOR[level] };
};

/** Why `lesson` cannot be studied now, or null. Checked against an already-advanced state. */
export const checkStudy = (state: BaseState, lesson: unknown): StudyBlockReason | null => {
  if (!isLessonId(lesson)) return "unknown_lesson";
  if (state.lessons.includes(lesson)) return "already_studied";
  if (!state.lessonsTaught.includes(lesson)) return "not_taught";
  if (state.study !== null) return "study_busy";
  const q = studyQuote(lesson);
  if (state.levels.academy < q.academyLevel) return "academy_level";
  if (!canAfford(state.resources, q.cost)) return "insufficient";
  return null;
};

/** Starts studying a taught lesson at the academy: paid now, learned for good at the end. */
export const startStudy = (state: BaseState, lesson: unknown, now: number, world: World): StudyResult => {
  const s = advance(state, now, world);
  const reason = checkStudy(s, lesson);
  if (reason !== null || !isLessonId(lesson)) return { ok: false, reason: reason ?? "unknown_lesson", state: s };
  const { cost, durationMs } = studyQuote(lesson);
  // As for upgrades: if the clock went backwards, `s.lastUpdated` is the latest time we trust.
  const startedAt = s.lastUpdated;
  return { ok: true, state: { ...s, resources: subtractResources(s.resources, cost), study: { lesson, startedAt, endsAt: startedAt + durationMs } } };
};
