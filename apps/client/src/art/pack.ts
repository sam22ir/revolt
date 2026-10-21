import type { BuildingId, NpcKind, ResourceId, TroopId } from "@revolt/rules";

/**
 * Every painted sprite the client draws, looked up by mechanical id. Scenes and UI read art only through a pack,
 * so balance code never names a sprite. Values are keys for `artUrl` / `textureKey` (see art.ts).
 */
export interface ArtPack {
  /** Base buildings on the base screen, keyed by building id. */
  readonly buildings: Readonly<Record<BuildingId, string>>;
  /** The painted ground slab under the base screen. */
  readonly baseGround: string;
  /** The sprite a player camp uses on the world map. */
  readonly camp: string;
  /** World-map sprite per NPC kind. Each keeps its own silhouette: watch tower, cart medallion, stone yard, star fort. */
  readonly npc: Readonly<Record<NpcKind, string>>;
  /** World-map march and rally markers. */
  readonly markers: {
    readonly march: string;
    readonly return: string;
    readonly battle: string;
    readonly rally: string;
  };
  /** Resource medallions in the HUD. */
  readonly resources: Readonly<Record<ResourceId, string>>;
  /** Troop medallions. */
  readonly troops: Readonly<Record<TroopId, string>>;
}

/** The first pack: the Algeria art set, using the sprite keys shipped in public/art. */
export const algeriaPack: ArtPack = {
  buildings: {
    hq: "buildings/hq",
    farm: "buildings/farm",
    armory: "buildings/armory",
    treasury: "buildings/treasury",
    barracks: "buildings/barracks",
  },
  baseGround: "buildings/ground_tile",
  camp: "buildings/hq",
  npc: {
    patrol: "map/outpost_watch",
    convoy: "map/marker_convoy",
    outpost: "map/outpost_barracks",
    fortified_line: "map/outpost_fort",
  },
  markers: {
    march: "map/marker_march",
    return: "map/marker_return",
    battle: "map/marker_battle",
    rally: "map/marker_rally",
  },
  resources: {
    food: "ui/resource_food",
    materiel: "ui/resource_materiel",
    funds: "ui/resource_funds",
    support: "ui/resource_support",
  },
  troops: {
    infantry: "units/troop_infantry",
    scouts: "units/troop_scouts",
    heavy: "units/troop_heavy",
    porters: "units/troop_porters",
  },
};

export const artPack: ArtPack = algeriaPack;
