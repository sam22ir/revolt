import { GEO_OASIS, GEO_ROAD, GEO_WADI, TERRAIN_IDS } from "@revolt/rules";
import manifest from "../../art/terrain-manifest.json";
import { hash01 } from "../terrain-props.ts";

/** What a painted decal stands for; it picks which frames of the decal atlas it may use. */
export type DecalKind = "sand" | "grass" | "stone" | "track";

/**
 * One painted ground stamp. `x` and `y` are fractional tile coordinates of its centre (tileToWorld(x, y) in world px), `frame` is an index
 * into the decal atlas, `scale` is its width in tiles (2 to 4), and `alpha` is its strength.
 */
export interface Decal {
  readonly x: number;
  readonly y: number;
  readonly frame: number;
  readonly scale: number;
  readonly flip: boolean;
  readonly alpha: number;
}

/** The decal atlas frames as the processing script wrote them, each tagged with its kind. */
const atlasFrames = (manifest as unknown as { readonly decals?: { readonly frames: readonly { readonly kind: DecalKind }[] } }).decals?.frames ?? [];

/** Frame indices of each kind, read from the manifest so the atlas and the placement cannot drift apart. */
export const DECAL_KIND_FRAMES: Readonly<Record<DecalKind, readonly number[]>> = {
  sand: atlasFrames.flatMap((f, i) => (f.kind === "sand" ? [i] : [])),
  grass: atlasFrames.flatMap((f, i) => (f.kind === "grass" ? [i] : [])),
  stone: atlasFrames.flatMap((f, i) => (f.kind === "stone" ? [i] : [])),
  track: atlasFrames.flatMap((f, i) => (f.kind === "track" ? [i] : [])),
};

/** Base chance that a tile gets a decal; rock and grove clusters add to it, so stamps gather where the 1a clusters are. */
const BASE_CHANCE = 0.16;
const CLUSTER_CHANCE = 0.34;
/** Cluster strength (0..1) above which a cluster decides the kind. */
const CLUSTER_KIND = 0.2;
/** Fertility above which open ground gets grass rather than sand. */
const GREEN_GROUND = 0.55;
/** Rock clusters show only below this fertility, as the rock props do in terrain-props.ts: green ground keeps its grass. */
const ROCKY = 0.6;
/** Share of arid plain tiles that get a cart track rather than a sand ripple. */
const TRACK_SHARE = 0.12;
/** Geography flags that never get a decal: roads, oasis pools and riverbeds. */
const NO_DECAL = GEO_ROAD | GEO_OASIS | GEO_WADI;

/** Chooses a kind from the tile's terrain, clusters and fertility. */
const kindFor = (terrain: string, fertility: number, rockW: number, groveW: number, r: number): DecalKind => {
  if (rockW > CLUSTER_KIND && rockW >= groveW && fertility < ROCKY) return "stone";
  if (terrain === "mountain") return "stone";
  if (terrain === "forest") return "grass";
  if (groveW > CLUSTER_KIND || fertility > GREEN_GROUND) return "grass";
  return r < TRACK_SHARE ? "track" : "sand";
};

/**
 * The painted decals of a map: sparse stamps on the open ground, placed by hash per tile and gathered by the 1a clusters. Pure and
 * deterministic for a seed. `terrain` holds TERRAIN_IDS indices per tile, `rocks` and `grove` cluster strength 0..255 per tile.
 */
export const decalsFor = (
  seed: number,
  size: number,
  terrain: Uint8Array,
  fertility: Float32Array,
  flags: Uint8Array,
  rocks: Uint8Array,
  grove: Uint8Array,
): Decal[] => {
  const out: Decal[] = [];
  const salt = (seed | 0) * 16 + 900;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (((flags[i] ?? 0) & NO_DECAL) !== 0) continue;
      const rockW = (rocks[i] ?? 0) / 255, groveW = (grove[i] ?? 0) / 255;
      const chance = BASE_CHANCE + CLUSTER_CHANCE * Math.max(rockW, groveW);
      if (hash01(x, y, salt) >= chance) continue;
      const kind = kindFor(TERRAIN_IDS[terrain[i] ?? 0] ?? "plain", fertility[i] ?? 0.5, rockW, groveW, hash01(x, y, salt + 1));
      const frames = DECAL_KIND_FRAMES[kind];
      if (frames.length === 0) continue;
      out.push({
        x: x + 0.5 + (hash01(x, y, salt + 2) - 0.5) * 0.9,
        y: y + 0.5 + (hash01(x, y, salt + 3) - 0.5) * 0.9,
        frame: frames[Math.floor(hash01(x, y, salt + 4) * frames.length)] ?? frames[0] ?? 0,
        scale: 2 + 2 * hash01(x, y, salt + 5),
        flip: hash01(x, y, salt + 6) < 0.5,
        alpha: 0.45 + 0.35 * hash01(x, y, salt + 7),
      });
    }
  }
  return out;
};
