import { describe, expect, test } from "vitest";
import {
  battleOdds,
  CLOSE_FROM,
  FORECAST_CHANCE_LEVEL,
  FORECAST_LOSSES_LEVEL,
  forecastFor,
  LIKELY_WIN_FROM,
  NO_BATTLE_MODIFIER,
  NPC_LEVELS,
  verdictOf,
  type Troops,
} from "../src/index.ts";

const troops = (infantry: number, scouts = 0, heavy = 0): Troops => ({ infantry, scouts, heavy, porters: 0 });

describe("battle odds", () => {
  test("a big march wins against a patrol, a tiny one loses against an outpost", () => {
    expect(battleOdds(troops(200), 1)!.winRate).toBe(1);
    expect(battleOdds(troops(1), 3)!.winRate).toBe(0);
  });

  test("the same march always gives the same odds (the samples are fixed)", () => {
    expect(battleOdds(troops(12, 6, 2), 2)).toEqual(battleOdds(troops(12, 6, 2), 2));
  });

  test("losses and wounded are averages within what was sent", () => {
    const o = battleOdds(troops(14, 4), 2)!;
    expect(o.avgLost).toBeGreaterThanOrEqual(0);
    expect(o.avgLost + o.avgWounded).toBeLessThanOrEqual(18);
  });

  test("no NPC of that level, or nobody sent: no odds", () => {
    expect(battleOdds(troops(10), NPC_LEVELS.length + 1)).toBeNull();
    expect(battleOdds(troops(10), 0)).toBeNull();
    expect(battleOdds(troops(0), 1)).toBeNull();
    expect(battleOdds(troops(10), 1, NO_BATTLE_MODIFIER, 0)).toBeNull();
  });
});

describe("what the watchtower shows", () => {
  test("verdicts follow the thresholds", () => {
    expect(verdictOf(1)).toBe("likely_victory");
    expect(verdictOf(LIKELY_WIN_FROM)).toBe("likely_victory");
    expect(verdictOf(LIKELY_WIN_FROM - 0.01)).toBe("close");
    expect(verdictOf(CLOSE_FROM)).toBe("close");
    expect(verdictOf(CLOSE_FROM - 0.01)).toBe("likely_defeat");
  });

  test("level 1 sees only the verdict; losses come at the losses level, the chance at the chance level", () => {
    const odds = { winRate: 0.62, avgLost: 3.4, avgWounded: 9.6 };
    expect(forecastFor(odds, 1)).toEqual({ verdict: "close", lost: null, wounded: null, chance: null, nextLevel: FORECAST_LOSSES_LEVEL });
    expect(forecastFor(odds, FORECAST_LOSSES_LEVEL)).toEqual({ verdict: "close", lost: 3, wounded: 10, chance: null, nextLevel: FORECAST_CHANCE_LEVEL });
    expect(forecastFor(odds, FORECAST_CHANCE_LEVEL)).toEqual({ verdict: "close", lost: 3, wounded: 10, chance: 60, nextLevel: null });
  });
});
