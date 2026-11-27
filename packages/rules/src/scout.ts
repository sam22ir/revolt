import { NO_BATTLE_MODIFIER, type BattleModifier } from "./battle.ts";
import { CLOSE_FROM, FORECAST_CHANCE_LEVEL, FORECAST_LOSSES_LEVEL, FORECAST_SAMPLES, LIKELY_WIN_FROM } from "./data/watchtower.ts";
import { fightNpc, npcLevel } from "./npc-battle.ts";
import { totalTroops, type Troops } from "./troops.ts";

export const FORECAST_VERDICTS = ["likely_victory", "close", "likely_defeat"] as const;
export type ForecastVerdict = (typeof FORECAST_VERDICTS)[number];

/** What playing a march many times shows: the share won, and the troops lost and wounded on average. */
export interface BattleOdds {
  readonly winRate: number;
  readonly avgLost: number;
  readonly avgWounded: number;
}

/** The seed of sample `i`: spread over the range, the same everywhere, unrelated to the real battle's seed (the server's secret). */
const sampleSeed = (i: number): number => (Math.imul(i + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;

/** Plays `troops` against an NPC of `level` over the sample seeds. Null for a level no NPC has, or a march with nobody in it. */
export const battleOdds = (troops: Troops, level: number, modifier: BattleModifier = NO_BATTLE_MODIFIER, samples = FORECAST_SAMPLES): BattleOdds | null => {
  if (npcLevel(level) === null || totalTroops(troops) === 0 || samples < 1) return null;
  let wins = 0;
  let lost = 0;
  let wounded = 0;
  for (let i = 0; i < samples; i++) {
    const { outcome } = fightNpc(troops, level, sampleSeed(i), modifier);
    if (outcome.result === "victory") wins += 1;
    lost += totalTroops(outcome.lost);
    wounded += totalTroops(outcome.wounded);
  }
  return { winRate: wins / samples, avgLost: lost / samples, avgWounded: wounded / samples };
};

export const verdictOf = (winRate: number): ForecastVerdict => (winRate >= LIKELY_WIN_FROM ? "likely_victory" : winRate >= CLOSE_FROM ? "close" : "likely_defeat");

/** What a watchtower of `level` lets the player see of the odds. Fields it does not reach are null. */
export interface Forecast {
  readonly verdict: ForecastVerdict;
  /** Troops expected lost and wounded, whole numbers (watchtower FORECAST_LOSSES_LEVEL and up). */
  readonly lost: number | null;
  readonly wounded: number | null;
  /** Chance of victory, 0 to 100 in steps of 5 (watchtower FORECAST_CHANCE_LEVEL and up). */
  readonly chance: number | null;
  /** The next watchtower level that would show more, or null at the top. */
  readonly nextLevel: number | null;
}

export const forecastFor = (odds: BattleOdds, watchtowerLevel: number): Forecast => {
  const losses = watchtowerLevel >= FORECAST_LOSSES_LEVEL;
  const chance = watchtowerLevel >= FORECAST_CHANCE_LEVEL;
  return {
    verdict: verdictOf(odds.winRate),
    lost: losses ? Math.round(odds.avgLost) : null,
    wounded: losses ? Math.round(odds.avgWounded) : null,
    chance: chance ? Math.round(odds.winRate * 20) * 5 : null,
    nextLevel: !losses ? FORECAST_LOSSES_LEVEL : !chance ? FORECAST_CHANCE_LEVEL : null,
  };
};
