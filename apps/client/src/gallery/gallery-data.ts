import type { ArtPack } from "../art/pack.ts";
import { hash01 } from "../scene/terrain-props.ts";

/** Pure helpers behind the style gallery. No DOM, no Phaser, no i18n: the gallery tests import this file. */

export type GalleryLang = "en" | "ar";

/** `?lang=ar` selects Arabic (RTL); anything else falls back to English. */
export const readLang = (search: string): GalleryLang => (new URLSearchParams(search).get("lang") === "ar" ? "ar" : "en");

export interface PackEntry {
  /** The `ArtPack` field, e.g. `buildings` or `baseGround`. */
  readonly field: string;
  /** The mechanical id inside the field (`hq`), or the field name for a single sprite. */
  readonly id: string;
  /** The sprite key the pack names (`buildings/hq`). */
  readonly key: string;
}

/** Every sprite the pack names, flattened and tagged with its field. */
export const packEntries = (pack: ArtPack): PackEntry[] => {
  const out: PackEntry[] = [];
  for (const [field, value] of Object.entries(pack)) {
    if (typeof value === "string") out.push({ field, id: field, key: value });
    else for (const [id, key] of Object.entries(value as Readonly<Record<string, string>>)) out.push({ field, id, key });
  }
  return out;
};

/** The set of sprite keys the pack uses; anything else in manifest.json is unused. */
export const packKeySet = (pack: ArtPack): ReadonlySet<string> => new Set(packEntries(pack).map((e) => e.key));

export interface ManifestItem {
  readonly key: string;
  readonly unused: boolean;
}

export interface ManifestGroup {
  /** First path segment of the keys in this group (`buildings`, `map`, `ui`, `units`). */
  readonly folder: string;
  readonly items: readonly ManifestItem[];
}

/** Groups manifest keys by folder (sorted), keeping manifest order inside a folder, and marks keys the pack does not use. */
export const groupManifestKeys = (keys: readonly string[], used: ReadonlySet<string>): ManifestGroup[] => {
  const byFolder = new Map<string, ManifestItem[]>();
  for (const key of keys) {
    const slash = key.indexOf("/");
    const folder = slash < 0 ? "(root)" : key.slice(0, slash);
    const items = byFolder.get(folder) ?? [];
    items.push({ key, unused: !used.has(key) });
    byFolder.set(folder, items);
  }
  return [...byFolder.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([folder, items]) => ({ folder, items }));
};

export interface Swatch {
  readonly name: string;
  readonly value: number;
}

/**
 * Every colour number in the theme, with a dotted name. A `[light, dark]` pair becomes `.light` and `.dark`;
 * the theme holds no other arrays, so new tokens appear here without editing the gallery.
 */
export const themeSwatches = (value: unknown, prefix = ""): Swatch[] => {
  if (typeof value === "number") return [{ name: prefix, value }];
  if (Array.isArray(value)) {
    return value.flatMap((v: unknown, i) => themeSwatches(v, `${prefix}.${i === 0 ? "light" : "dark"}`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => themeSwatches(v, prefix === "" ? k : `${prefix}.${k}`));
  }
  return [];
};

export interface SeamTile {
  readonly tx: number;
  readonly ty: number;
  /** Index into the terrain's ground atlas. */
  readonly frame: number;
  readonly flip: boolean;
}

/**
 * A size x size patch of tiles with the same frame and flip choices the game makes (salts 7 and 8 in
 * the removed painted ground renderer), so the patch is fixed across reloads. Sorted back to front like the game's depth.
 */
export const seamTiles = (size: number, frameCount: number): SeamTile[] => {
  const tiles: SeamTile[] = [];
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      tiles.push({
        tx,
        ty,
        frame: Math.min(frameCount - 1, Math.floor(hash01(tx, ty, 7) * frameCount)),
        flip: hash01(tx, ty, 8) < 0.5,
      });
    }
  }
  return tiles.sort((a, b) => a.tx + a.ty - (b.tx + b.ty) || a.tx - b.tx);
};

/** The gallery's own dark background, for judging sprites on near-black. */
export const DARK_STAGE = "#0d0d0b";
