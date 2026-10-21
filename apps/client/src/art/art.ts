import type { BackgroundId } from "@revolt/rules";
import type { SpriteSpec } from "../scene/sprite-pool.ts";
import manifest from "./manifest.json";
import terrainManifest from "./terrain-manifest.json";

/** Sprite size and measured ground anchors (px of the shipped WebP), written by `pnpm art:process`. */
export interface SpriteInfo {
  readonly w: number;
  readonly h: number;
  readonly bottom: { readonly x: number; readonly y: number };
  readonly left: { readonly x: number; readonly y: number };
  readonly right: { readonly x: number; readonly y: number };
}

export const spriteInfo = (key: string): SpriteInfo => {
  const info = (manifest as Readonly<Record<string, SpriteInfo>>)[key];
  if (info === undefined) throw new Error(`no art for ${key}; run pnpm art:process`);
  return info;
};

/** URL of a shipped sprite, e.g. `buildings/hq`. Relative to the page base, so it works under Capacitor too. */
export const artUrl = (key: string): string => `${import.meta.env.BASE_URL}art/${key}.webp`;

/** Phaser texture key for a sprite. */
export const textureKey = (key: string): string => `art:${key}`;

/** A sprite that stands on a diamond (terrain, building, outpost): its diamond centre is the anchor, its diamond `diamondWidth` world px wide. */
export const diamondSpec = (key: string, diamondWidth: number): SpriteSpec => {
  const i = spriteInfo(key);
  const span = i.right.x - i.left.x;
  return { texture: textureKey(key), w: i.w, anchorX: (i.left.x + i.right.x) / 2, anchorY: (i.left.y + i.right.y) / 2, scale: diamondWidth / span };
};

/** A round or free-standing icon: anchored at its middle, `width` world px wide. */
export const iconSpec = (key: string, width: number): SpriteSpec => {
  const i = spriteInfo(key);
  return { texture: textureKey(key), w: i.w, anchorX: i.w / 2, anchorY: i.h / 2, scale: width / i.w };
};

/**
 * Sprites a background draws with its own file, `art/<background>/<key>.webp`, keyed like the manifest (`buildings/farm`).
 * Anything not listed uses the shared sprite, so a background never blocks on art.
 * PLACEHOLDER: Vietnam has no sprites of its own yet and reuses the Algerian ones (rice-paddy farm, tunnel HQ and the
 * rest are listed in docs/art.md). Add a key here when its file is produced and `pnpm art:process` has run.
 */
export const BACKGROUND_ART: Readonly<Record<BackgroundId, ReadonlySet<string>>> = {
  algeria: new Set(),
  vietnam: new Set(),
};

/** The manifest key to draw `key` with for this background: its own sprite if it has one, else the shared one. */
export const artKeyFor = (background: BackgroundId, key: string): string => (BACKGROUND_ART[background].has(key) ? `${background}/${key}` : key);

/** Atlas frames of the world terrain (ground tiles and props), written by `pnpm art:terrain`. */
export interface AtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Props only: the object's ground anchor (bottom centre of its opaque pixels) in the frame. */
  readonly ax?: number;
  readonly ay?: number;
}
export interface Atlas {
  readonly w: number;
  readonly h: number;
  readonly frames: readonly AtlasFrame[];
}
export const terrainAtlases = terrainManifest as unknown as { readonly ground: Readonly<Record<string, Atlas>>; readonly props: Readonly<Record<string, Atlas>> };
export const groundTexture = (terrain: string): string => `terrain:ground-${terrain}`;
export const propsTexture = (kind: string): string => `terrain:props-${kind}`;
export const groundUrl = (terrain: string): string => `${import.meta.env.BASE_URL}art/terrain/ground-${terrain}.webp`;
export const propsUrl = (kind: string): string => `${import.meta.env.BASE_URL}art/terrain/props-${kind}.webp`;
