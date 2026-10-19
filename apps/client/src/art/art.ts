import type { SpriteSpec } from "../scene/sprite-pool.ts";
import manifest from "./manifest.json";

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
