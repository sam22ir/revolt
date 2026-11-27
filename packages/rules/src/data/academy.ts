import type { Resources } from "../resources.ts";

/**
 * Studying a taught lesson at the academy (docs/villages-plan.md): what it costs and how long it takes, by the lesson's level, and
 * the academy level each lesson level needs. Placeholder balance.
 */
const r = (food: number, materiel: number, funds: number): Resources => ({ food, materiel, funds, support: 0 });

export const STUDY_COST: Readonly<Record<1 | 2 | 3, Resources>> = { 1: r(300, 300, 400), 2: r(1200, 1200, 1600), 3: r(4000, 4000, 5500) };
export const STUDY_MS: Readonly<Record<1 | 2 | 3, number>> = { 1: 30 * 60_000, 2: 2 * 3_600_000, 3: 8 * 3_600_000 };
export const ACADEMY_LEVEL_FOR: Readonly<Record<1 | 2 | 3, number>> = { 1: 1, 2: 3, 3: 5 };
