import { TILE_H } from "./world-layout.ts";

/**
 * Sprite sizes of map markers, in tiles across (see SpecCache.tile). Shared by the object layer that draws them, the tap
 * snapping that lets a finger on a roof pick the base, and the DOM name plates that sit above them, so the three agree.
 */
/** A base covers a square of this many tiles a side (its own tile is the top corner; the rest lie to the south). */
export const BASE_SPAN = 2;
export const BASE_SCALE_OWN = BASE_SPAN;
export const BASE_SCALE_OTHER = BASE_SPAN;
/** The camp art's walled yard is narrower than the square its sprite is anchored on, but as tall: the selection outline keeps this share of the square's width and height. */
export const BASE_OUTLINE_FIT_X = 0.8;
export const BASE_OUTLINE_FIT_Y = 0.97;
export const NPC_SCALE = 1.45;
/** The convoy medallion and alliance HQ pennant, for tap reach: about a tile, raised above their tile. */
export const MEDALLION_SCALE = 1.0;

/** Markers keep at least a thumb's worth of screen size however far out you zoom: the factor the sprites are scaled by. */
export const markerFactor = (zoom: number): number => Math.max(1, 16 / (zoom * TILE_H));

/** World px above a base's tile centre where its name plate's bottom edge goes: just over the sprite's roof. */
export const plateLift = (_mine: boolean, zoom: number): number => TILE_H * 1.45 * markerFactor(zoom);
