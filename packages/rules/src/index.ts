export { advance } from "./advance.ts";
export { createBaseState, type BaseState, type UpgradeJob } from "./base-state.ts";
export { BUILDING_IDS, type BuildingId } from "./building-id.ts";
export { BUILDINGS, MAX_BUILDING_LEVEL, type BuildingDef, type BuildingLevel } from "./data/buildings.ts";
export { STORAGE_CAPS } from "./data/storage.ts";
export { START_LEVELS, START_RESOURCES } from "./data/start.ts";
export { accrue, productionPerHour, storageCap } from "./production.ts";
export { importM1Save } from "./import-m1.ts";
export { M1_IMPORT_MAX_LEVEL } from "./data/m1-import.ts";
export { RESOURCE_IDS, type ResourceId } from "./resource-id.ts";
export { canAfford, type Resources } from "./resources.ts";
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
