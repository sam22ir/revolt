import type { Resources } from "../resources.ts";
import type { Troops } from "../troops.ts";

/**
 * Colonial NPC targets (GDD §2.1, §4.5): an army and its institutions, never a people (GDD §6).
 * Names and descriptions are i18n keys `npc.<kind>.*`.
 */
export const NPC_KINDS = ["patrol", "convoy", "outpost", "fortified_line"] as const;
export type NpcKind = (typeof NPC_KINDS)[number];

export interface NpcLevelDef {
  readonly level: number;
  readonly kind: NpcKind;
  readonly defenders: Troops;
  /** Taken home by a victorious march, up to its carry capacity. */
  readonly loot: Resources;
  /** Too strong for one player: only an alliance rally may attack it. */
  readonly rallyOnly: boolean;
}

const t = (infantry: number, scouts: number, heavy: number): Troops => ({ infantry, scouts, heavy, porters: 0 });
const r = (food: number, materiel: number, funds: number): Resources => ({ food, materiel, funds, support: 0 });

// Placeholder balance for M3. Row `i` is level `i + 1`.
export const NPC_LEVELS: readonly NpcLevelDef[] = [
  { level: 1, kind: "patrol", defenders: t(4, 3, 0), loot: r(300, 200, 150), rallyOnly: false },
  { level: 2, kind: "convoy", defenders: t(12, 8, 6), loot: r(800, 600, 400), rallyOnly: false },
  { level: 3, kind: "outpost", defenders: t(30, 20, 25), loot: r(2000, 1500, 1000), rallyOnly: false },
  { level: 4, kind: "fortified_line", defenders: t(60, 40, 50), loot: r(6000, 4500, 3000), rallyOnly: true },
];

export const MAX_NPC_LEVEL = NPC_LEVELS.length;

/** A defeated target reappears elsewhere after this long. */
export const NPC_RESPAWN_MS = 10 * 60_000;
