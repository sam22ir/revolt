import { TILE_H } from "./world-layout.ts";

/**
 * Sprite sizes of map markers, in tiles across (see SpecCache.tile). Shared by the object layer that draws them, the tap
 * snapping that lets a finger on a roof pick the base, and the DOM name plates that sit above them, so the three agree.
 */
export const BASE_SCALE_OWN = 2.0;
export const BASE_SCALE_OTHER = 1.7;
export const NPC_SCALE = 1.45;
/** The convoy medallion and alliance HQ pennant, for tap reach: about a tile, raised above their tile. */
export const MEDALLION_SCALE = 1.0;

/** Markers keep at least a thumb's worth of screen size however far out you zoom: the factor the sprites are scaled by. */
export const markerFactor = (zoom: number): number => Math.max(1, 16 / (zoom * TILE_H));

/** World px above a base's tile centre where its name plate's bottom edge goes: just over the sprite's roof. */
export const plateLift = (mine: boolean, zoom: number): number => TILE_H * (mine ? 1.45 : 1.25) * markerFactor(zoom);
