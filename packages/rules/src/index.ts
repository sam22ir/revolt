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
  START_STORY,
  type BaseState,
  type StoryProgress,
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
  type EventsResponse,
  type EventView,
  type LeaderboardEntryView,
  type LeaderboardResponse,
  type MarchPhase,
  type PassView,
  type ProductView,
  type StoreView,
  type WalletView,
} from "./wire.ts";
export { HEROES_BY_BACKGROUND, heroesFor, isHeroId, isHeroOf } from "./hero-id.ts";
export { addShardsToOwned } from "./hero-shards.ts";
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

export { COSMETIC_IDS, COSMETIC_SLOT, COSMETIC_SLOTS, isCosmeticId, slotOf, type CosmeticId, type CosmeticSlot } from "./data/cosmetics.ts";
export { DAY_MS, EVENT_CLAIM_GRACE_MS, EVENT_IDS, EVENTS, isEventId, LIVE_ANCHOR, type EventDef, type EventId, type EventTier } from "./data/events.ts";
export { PASS_ANCHOR, PASS_SEASON_MS, PASS_TIER_COUNT, PASS_TIERS, PASS_XP_PER_TIER, type PassTier } from "./data/battle-pass.ts";
export { isProductSku, MAX_PRODUCT_RESOURCES, MAX_PRODUCT_TOKENS, PRODUCT_KINDS, PRODUCT_SKUS, PRODUCTS, type ProductDef, type ProductKind, type ProductSku } from "./data/store.ts";
export { grantReward, rewardHasBaseParts, type Reward } from "./reward.ts";
export {
  activeEvents,
  claimableWindows,
  EVENT_BLOCK_REASONS,
  eventKey,
  eventReward,
  eventRewardTier,
  eventScoreFor,
  eventsFor,
  eventWindow,
  marchAwards,
  parseEventKey,
  passKey,
  passSeasonAt,
  passXpFor,
  type Award,
  type EventBlockReason,
  type EventWindow,
} from "./events.ts";
export {
  compareEntries,
  isLeaderboardId,
  LEADERBOARD_PAGE,
  LEADERBOARDS,
  playerPower,
  POWER_PER_BUILDING_LEVEL,
  POWER_PER_HERO_LEVEL,
  rankOf,
  regionsLiberated,
  type BoardEntry,
  type LeaderboardId,
} from "./leaderboard.ts";
export {
  addPassXp,
  claimableTiers,
  claimTier,
  EMPTY_PASS,
  isClaimed,
  isPassTrack,
  PASS_BLOCK_REASONS,
  PASS_TRACKS,
  reachedTier,
  type PassBlockReason,
  type PassClaim,
  type PassProgress,
  type PassTrack,
} from "./battle-pass.ts";
export {
  MAX_SPEEDUP_TOKENS_HELD,
  SPEEDUP_BLOCK_REASONS,
  SPEEDUP_DAILY_CAP_MS,
  SPEEDUP_MAX_PER_USE,
  SPEEDUP_TOKEN_MS,
  speedUp,
  STORE_BLOCK_REASONS,
  usedToday,
  utcDay,
  type SpeedUpBlockReason,
  type SpeedUpResult,
  type StoreBlockReason,
} from "./store.ts";
