import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUILDING_IDS, NPC_KINDS, RESOURCE_IDS, TERRAIN_IDS, TROOP_IDS } from "@revolt/rules";
import { artPack, type ArtPack } from "../src/art/pack.ts";
import manifest from "../src/art/manifest.json";
import terrainManifest from "../src/art/terrain-manifest.json";

const PUBLIC_ART = fileURLToPath(new URL("../public/art/", import.meta.url));

/** Every sprite key the pack names, flattened. */
const packKeys = (pack: ArtPack): string[] => [
  ...Object.values(pack.buildings),
  pack.baseGround,
  pack.camp,
  ...Object.values(pack.npc),
  ...Object.values(pack.markers),
  ...Object.values(pack.resources),
  ...Object.values(pack.troops),
];

describe("art pack", () => {
  it("has a sprite for every building, troop, resource, NPC kind and terrain", () => {
    for (const id of BUILDING_IDS) expect(artPack.buildings[id], `building ${id}`).toBeTruthy();
    for (const id of TROOP_IDS) expect(artPack.troops[id], `troop ${id}`).toBeTruthy();
    for (const id of RESOURCE_IDS) expect(artPack.resources[id], `resource ${id}`).toBeTruthy();
    for (const kind of NPC_KINDS) expect(artPack.npc[kind], `npc ${kind}`).toBeTruthy();
  });

  it("names only sprites that are in the manifest", () => {
    const shipped = manifest as Readonly<Record<string, unknown>>;
    for (const key of packKeys(artPack)) expect(shipped[key], `manifest entry for ${key}`).toBeDefined();
  });

  it("has a shipped WebP file for every sprite it names", () => {
    for (const key of packKeys(artPack)) expect(existsSync(`${PUBLIC_ART}${key}.webp`), `public/art/${key}.webp`).toBe(true);
  });

  it("has a ground atlas for every terrain", () => {
    for (const terrain of TERRAIN_IDS) {
      const atlas = (terrainManifest.ground as Record<string, { frames: unknown[] }>)[terrain];
      expect(atlas?.frames.length ?? 0, `ground atlas ${terrain}`).toBeGreaterThan(0);
    }
  });
});
