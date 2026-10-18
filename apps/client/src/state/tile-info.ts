import {
  checkMarch,
  npcLevel,
  terrainAt,
  travelMs,
  TROOP_IDS,
  TROOPS,
  type BaseState,
  type MapBaseView,
  type MapNpcView,
  type MapPoint,
  type MapSnapshot,
  type MarchBlockReason,
  type NpcLevelDef,
  type TerrainId,
  type Troops,
} from "@revolt/rules";

/** What a tapped tile holds. Every tile also has terrain. */
export type TileInfo =
  | { readonly kind: "own"; readonly base: MapBaseView; readonly terrain: TerrainId }
  | { readonly kind: "camp"; readonly base: MapBaseView; readonly terrain: TerrainId }
  | { readonly kind: "npc"; readonly npc: MapNpcView; readonly def: NpcLevelDef | null; readonly terrain: TerrainId }
  | { readonly kind: "empty"; readonly terrain: TerrainId };

export const tileInfo = (snapshot: MapSnapshot, x: number, y: number): TileInfo => {
  const terrain = terrainAt(snapshot.terrainSeed, x, y);
  const base = snapshot.bases.find((b) => b.x === x && b.y === y);
  if (base !== undefined) return { kind: base.mine ? "own" : "camp", base, terrain };
  const npc = snapshot.npcs.find((n) => n.x === x && n.y === y);
  if (npc !== undefined) return { kind: "npc", npc, def: npcLevel(npc.level), terrain };
  return { kind: "empty", terrain };
};

/** The player's own base on the map, or null before the server has placed it. */
export const ownBase = (snapshot: MapSnapshot | null): MapBaseView | null => snapshot?.bases.find((b) => b.mine) ?? null;

/** What one surviving unit of each type can carry home, summed. */
export const carryCapacity = (troops: Troops): number => TROOP_IDS.reduce((n, id) => n + troops[id] * TROOPS[id].carry, 0);

export interface MarchPreview {
  /** One-way travel time, or null when no troops are chosen. */
  readonly travelMs: number | null;
  readonly carry: number;
  /** Why this march could not be sent, or null if it can. */
  readonly reason: MarchBlockReason | null;
}

/** What the send-march dialog shows for the troops chosen so far. */
export const previewMarch = (state: BaseState, from: MapPoint, to: MapPoint, troops: Troops): MarchPreview => {
  const ms = travelMs(from, to, troops);
  return { travelMs: Number.isFinite(ms) ? ms : null, carry: carryCapacity(troops), reason: checkMarch(state, troops) };
};
