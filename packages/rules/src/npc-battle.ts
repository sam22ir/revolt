import type { MarchOutcome } from "./base-state.ts";
import { NO_BATTLE_MODIFIER, resolveBattle, type BattleModifier, type BattleResult } from "./battle.ts";
import { NPC_LEVELS, type NpcLevelDef } from "./data/npcs.ts";
import { ZERO_RESOURCES } from "./resources.ts";
import { ZERO_TROOPS, type Troops } from "./troops.ts";

export const npcLevel = (level: number): NpcLevelDef | null => NPC_LEVELS[level - 1] ?? null;

/** A march against an NPC target of `level`: the battle and what the march brings home. `modifier` carries the march's hero effects. */
export const fightNpc = (
  troops: Troops,
  level: number,
  seed: number,
  modifier: BattleModifier = NO_BATTLE_MODIFIER,
): { outcome: MarchOutcome; battle: BattleResult | null } => {
  const def = npcLevel(level);
  if (def === null) return { outcome: targetGone(troops), battle: null };
  const battle = resolveBattle(troops, def.defenders, def.loot, seed, modifier);
  return {
    battle,
    outcome: {
      result: battle.victory ? "victory" : "defeat",
      survivors: battle.attackerSurvivors,
      wounded: battle.attackerWounded,
      lost: battle.attackerLost,
      loot: battle.loot,
    },
  };
};

/** The target was gone on arrival: no battle, everyone comes home. */
export const targetGone = (troops: Troops): MarchOutcome => ({
  result: "target_gone",
  survivors: troops,
  wounded: ZERO_TROOPS,
  lost: ZERO_TROOPS,
  loot: ZERO_RESOURCES,
});
