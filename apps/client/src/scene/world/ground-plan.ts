import { TERRAIN_IDS } from "@revolt/rules";
import { propsFor, type PropContext, type PropPlan } from "../terrain-props.ts";
import { blendedGround, landTint } from "./ground-tint.ts";

/** What a terrain build feeds the per-tile plan: the terrain, geography flags and fertility per tile, all row-major. */
export interface GroundPlanInput {
  readonly size: number;
  /** Index into TERRAIN_IDS per tile. */
  readonly terrain: Uint8Array;
  /** GEO_* flags (with the client's OASIS_FRONT bit) per tile. */
  readonly flags: Uint8Array;
  readonly fertility: Float32Array;
  /** Rock and grove cluster strength per tile, 0..255 (see decor-clusters.ts). */
  readonly rocks: Uint8Array;
  readonly grove: Uint8Array;
  /** Ground colour per terrain index. */
  readonly palette: readonly number[];
}

/** Per tile, computed once per terrain build so a repaint only reads them. */
export interface GroundPlan {
  /** The final ground colour of each tile, 0xRRGGBB. */
  readonly colours: Uint32Array;
  /** The props each tile carries before the occupied check, which depends on the snapshot, not on the terrain. */
  readonly props: readonly (readonly PropPlan[])[];
}

/** Computes the ground colour and the prop plans of every tile. Costs one pass over the map. */
export const buildGroundPlan = (input: GroundPlanInput): GroundPlan => {
  const { size, terrain, flags, fertility, rocks, grove, palette } = input;
  const idAt = (x: number, y: number): number => (x < 0 || y < 0 || x >= size || y >= size ? -1 : (terrain[y * size + x] ?? -1));
  // Share of the eight neighbours with the same terrain; off the map counts as the same, so a region does not thin at the edge.
  const interior = (x: number, y: number): number => {
    const id = terrain[y * size + x];
    let same = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || idAt(nx, ny) === id) same++;
      }
    }
    return same / 8;
  };
  const colours = new Uint32Array(size * size);
  const props: (readonly PropPlan[])[] = new Array<readonly PropPlan[]>(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const terrainId = TERRAIN_IDS[terrain[i] ?? 0] ?? "plain";
      const ctx: PropContext = { flags: flags[i] ?? 0, fertility: fertility[i] ?? 0.5, rocks: (rocks[i] ?? 0) / 255, grove: (grove[i] ?? 0) / 255 };
      colours[i] = landTint(blendedGround(idAt, x, y, palette), terrainId, ctx);
      props[i] = propsFor(terrainId, x, y, interior(x, y), ctx);
    }
  }
  return { colours, props };
};
