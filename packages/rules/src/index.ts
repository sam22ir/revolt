export { advance } from "./advance.ts";
export {
  ALLIANCE_ACTIONS,
  ALLIANCE_BLOCK_REASONS,
  ALLIANCE_RANKS,
  canKick,
  canPerform,
  demotedRank,
  isAllianceRank,
  nameKey,
  promotedRank,
  validateAllianceName,
  validateAllianceTag,
  validateChatText,
  type AllianceAction,
  type AllianceBlockReason,
  type AllianceRank,
} from "./alliance.ts";
export * from "./data/alliance.ts";
export { HELP_KINDS, helpableJob, isHelpKind, reduceJob, type HelpKind, type HelpableJob } from "./help.ts";
export { apportion, isGatherOption, resolveRally, rallyTiming, splitOutcome, type RallyParticipant, type RallyShare } from "./rally.ts";
export {
  createBaseState,
  MARCH_RESULTS,
  type BaseState,
  type MapPoint,
  type MarchHeroes,
  type MarchOutcome,
  type MarchResult,
  type MarchState,
  type TrainingJob,
  type UpgradeJob,
} from "./base-state.ts";
export { counterFactor, resolveBattle, takeLoot, type BattleResult, type BattleRound } from "./battle.ts";
export { BUILDING_IDS, type BuildingId } from "./building-id.ts";
export { heroBattleModifier, checkLoadout, heroesOnMarch, parseHeroLoadout, HERO_LOADOUT_BLOCK_REASONS, loadoutIds, MAX_DEPUTIES, snapshotHeroes, type HeroLoadout, type HeroLoadoutBlockReason } from "./hero-loadout.ts";
export { drawHero, HERO_DRAW_BLOCK_REASONS, isPityDraw, recruitHero, type HeroDraw, type HeroDrawBlockReason, type HeroRecruitResult } from "./hero-draw.ts";
export { heroLevelCap, HERO_LEVEL_BLOCK_REASONS, levelUpHero, shardsToNextLevel, type HeroLevelBlockReason, type HeroLevelResult } from "./hero-level.ts";
export { EMPTY_HERO_ROSTER, type HeroEntry, type HeroRoster } from "./hero-roster.ts";
export { HERO_IDS, HERO_RARITIES, SKILL_IDS, type HeroId, type HeroRarity, type HeroSpecialty, type SkillId } from "./hero-id.ts";
export { HEROES, type HeroDef, type SkillDef } from "./data/heroes.ts";
export * from "./data/hero-progression.ts";
export { NO_BATTLE_MODIFIER, type BattleModifier } from "./battle.ts";
export { BUILDINGS, MAX_BUILDING_LEVEL, type BuildingDef, type BuildingLevel } from "./data/buildings.ts";
export { MAP_SIZE, MARCH_RESCUE_GRACE_MS, MAX_MARCHES, NPC_COUNT_BY_LEVEL, PLACEMENT_SPACING } from "./data/map.ts";
export { MAX_NPC_LEVEL, NPC_KINDS, NPC_LEVELS, NPC_RESPAWN_MS, type NpcKind, type NpcLevelDef } from "./data/npcs.ts";
export { STORAGE_CAPS } from "./data/storage.ts";
export { START_LEVELS, START_RESOURCES, START_TROOPS } from "./data/start.ts";
export { COUNTER_BONUS, LOST_SHARE, MAX_BATTLE_ROUNDS, TRAINING_BATCH_PER_LEVEL, TROOPS, type TroopDef } from "./data/troops.ts";
export { accrue, productionPerHour, storageCap } from "./production.ts";
export { importM1Save } from "./import-m1.ts";
export { M1_IMPORT_MAX_LEVEL } from "./data/m1-import.ts";
export {
  checkMarch,
  MARCH_BLOCK_REASONS,
  marchSpeed,
  planMarch,
  settleMarch,
  startMarch,
  tileDistance,
  travelMs,
  type MarchBlockReason,
  type MarchStartResult,
  type MarchTiming,
} from "./march.ts";
export { migrateBaseState } from "./migrate-state.ts";
export { fightNpc, npcLevel, targetGone } from "./npc-battle.ts";
export { RESOURCE_IDS, type ResourceId } from "./resource-id.ts";
export { canAfford, ZERO_RESOURCES, type Resources } from "./resources.ts";
export { hash32, isSeed, seededRng } from "./rng.ts";
export { isOnMap, terrainAt, TERRAIN_IDS, type TerrainId } from "./terrain.ts";
export {
  checkTraining,
  maxTrainingBatch,
  startTraining,
  TRAINING_BLOCK_REASONS,
  trainingQuote,
  type TrainingBlockReason,
  type TrainingQuote,
  type TrainingResult,
} from "./training.ts";
export { COMBAT_TROOP_IDS, TROOP_IDS, type TroopId } from "./troop-id.ts";
export {
  addTroops,
  hasTroops,
  isTroops,
  MAX_TROOP_COUNT,
  parseTroops,
  subtractTroops,
  totalTroops,
  ZERO_TROOPS,
  type Troops,
} from "./troops.ts";
export {
  checkUpgrade,
  nextLevelQuote,
  remainingMs,
  startUpgrade,
  UPGRADE_BLOCK_REASONS,
  type UpgradeBlockReason,
  type UpgradeCheck,
  type UpgradeQuote,
  type UpgradeResult,
} from "./upgrade.ts";
export { isBaseState } from "./validate-state.ts";
export {
  MARCH_PHASES,
  type AllianceClientMessage,
  type AllianceListItem,
  type AllianceMemberView,
  type AllianceServerMessage,
  type AllianceView,
  type BattleReport,
  type ChatMessage,
  type HelpRequestView,
  type MapHqView,
  type RallyView,
  type MapBaseView,
  type MapMarchView,
  type MapNpcView,
  type MapServerMessage,
  type MapSnapshot,
  type MarchPhase,
} from "./wire.ts";
