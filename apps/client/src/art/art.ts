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
