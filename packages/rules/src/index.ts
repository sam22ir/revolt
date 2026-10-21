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
  START_HEROES,
  START_STORY,
  type BaseState,
  type HeroProgress,
  type SquadMember,
  type StoryProgress,
  type MapPoint,
  type MarchOutcome,
  type MarchResult,
  type MarchState,
  type TrainingJob,
  type UpgradeJob,
} from "./base-state.ts";
export { counterFactor, NO_MODS, resolveBattle, takeLoot, type BattleMods, type BattleResult, type BattleRound } from "./battle.ts";
export { BUILDING_IDS, type BuildingId } from "./building-id.ts";
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
export { HERO_IDS, HEROES_BY_BACKGROUND, heroesFor, isHeroId, isHeroOf, type HeroId } from "./hero-id.ts";
export {
  DEPUTY_WEIGHT,
  HERO_LEVEL_UP,
  HERO_LEVELS_PER_HALL_LEVEL,
  HERO_RARITIES,
  HEROES,
  LEAD_WEIGHT,
  MAX_HERO_LEVEL,
  MAX_HERO_SHARDS,
  MAX_MOD_UNITS,
  MAX_SQUAD,
  NPC_SHARD_DROP,
  SKILL_KINDS,
  type HeroDef,
  type HeroLevelUpCost,
  type HeroRarity,
  type HeroSkill,
  type SkillKind,
} from "./data/heroes.ts";
export {
  addUnits,
  busyHeroes,
  checkLevelUp,
  checkRecruit,
  checkSquad,
  heroLevelCap,
  heroMods,
  heroUnits,
  HERO_BLOCK_REASONS,
  levelUpCost,
  levelUpHero,
  NO_UNITS,
  recruitHero,
  skillPct,
  squadSnapshot,
  SQUAD_BLOCK_REASONS,
  unitsToMods,
  type HeroBlockReason,
  type HeroResult,
  type ModUnits,
  type SquadBlockReason,
} from "./heroes.ts";
export { addShards } from "./hero-progress.ts";
export { STORY, type ChapterReward, type Objective, type StoryChapter } from "./data/story.ts";
export { BACKGROUND_IDS, BACKGROUND_SERVER, backgroundOfServer, DEFAULT_BACKGROUND, isBackgroundId, serverFor, type BackgroundId } from "./background.ts";
export {
  chapterStatus,
  chaptersFor,
  claimChapter,
  currentChapter,
  objectiveProgress,
  STORY_BLOCK_REASONS,
  type ChapterStatus,
  type ObjectiveProgress,
  type StoryBlockReason,
  type StoryResult,
} from "./story.ts";
