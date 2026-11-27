import type { BaseState } from "./base-state.ts";
import { LESSONS, type LessonStat } from "./data/villages.ts";

/** The sum of a stat over the lessons studied (docs/villages-plan.md). 0 with none. Fractions add up (two +6% make +12%). */
export const lessonBonus = (state: Pick<BaseState, "lessons">, stat: LessonStat): number =>
  (state.lessons ?? []).reduce((sum, id) => sum + (LESSONS[id]?.stat === stat ? LESSONS[id].value : 0), 0);
