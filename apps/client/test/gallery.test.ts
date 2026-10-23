import { expect } from "vitest";
import { TERRAIN_IDS } from "@revolt/rules";
import { artPack } from "../src/art/pack.ts";
import manifest from "../src/art/manifest.json";
import terrainManifest from "../src/art/terrain-manifest.json";
import { groupManifestKeys, packEntries, packKeySet, readLang, seamTiles, themeSwatches } from "../src/gallery/gallery-data.ts";
import { theme } from "../src/theme/theme.ts";
import { test } from "vitest";
import { rows, type Row } from "./rows.ts";
const RA: Row[] = [];

RA.push(["resolves every art pack key in manifest.json", () => {
  const shipped = manifest as Readonly<Record<string, unknown>>;
  for (const { key } of packEntries(artPack)) expect(shipped[key], `manifest entry for ${key}`).toBeDefined();
}]);

RA.push(["has at least one ground frame for every terrain in the manifest", () => {
  const ground = terrainManifest.ground as Readonly<Record<string, { frames: unknown[] }>>;
  expect(Object.keys(ground).length).toBeGreaterThan(0);
  for (const [terrain, atlas] of Object.entries(ground)) expect(atlas.frames.length, terrain).toBeGreaterThan(0);
  for (const terrain of TERRAIN_IDS) expect(ground[terrain]?.frames.length ?? 0, terrain).toBeGreaterThan(0);
}]);

RA.push(["groups manifest keys by folder and marks the keys the pack does not use", () => {
  const groups = groupManifestKeys(["units/a", "buildings/b", "buildings/c", "plain"], new Set(["buildings/b"]));
  expect(groups.map((g) => g.folder)).toEqual(["(root)", "buildings", "units"]);
  expect(groups.find((g) => g.folder === "buildings")?.items).toEqual([
    { key: "buildings/b", unused: false },
    { key: "buildings/c", unused: true },
  ]);
}]);

RA.push(["reports which sprite keys the pack uses", () => {
  const used = packKeySet(artPack);
  expect(used.has("buildings/hq")).toBe(true);
  expect(used.has("buildings/academy")).toBe(false);
  expect(packEntries(artPack).some((e) => e.field === "baseGround" && e.key === artPack.baseGround)).toBe(true);
}]);

RA.push(["lists every theme colour, with terrain pairs split into light and dark", () => {
  const names = themeSwatches(theme).map((s) => s.name);
  expect(names).toContain("ground.base");
  expect(names).toContain("terrain.plain.light");
  expect(names).toContain("terrain.plain.dark");
  expect(names).toContain("ink.base");
}]);

RA.push(["chooses Arabic only for ?lang=ar", () => {
  expect(readLang("?lang=ar")).toBe("ar");
  expect(readLang("?lang=en")).toBe("en");
  expect(readLang("?lang=fr")).toBe("en");
  expect(readLang("")).toBe("en");
}]);

RA.push(["builds a fixed, back-to-front 6x6 seam patch", () => {
  const a = seamTiles(6, 20);
  expect(a).toHaveLength(36);
  expect(a).toEqual(seamTiles(6, 20));
  expect(a.every((t) => t.frame >= 0 && t.frame < 20)).toBe(true);
  for (let i = 1; i < a.length; i++) expect((a[i - 1]?.tx ?? 0) + (a[i - 1]?.ty ?? 0)).toBeLessThanOrEqual((a[i]?.tx ?? 0) + (a[i]?.ty ?? 0));
}]);


test("gallery data: art keys, ground frames, folders, palette, language, seam patch", () => rows(RA));
