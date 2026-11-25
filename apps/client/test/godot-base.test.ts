/**
 * Golden data for the Godot port of the base screen: the layout maths of `iso-layout.ts` (plot placement, ground slab, camera
 * fit) with the real sprite anchors, and the number and countdown text of `format.ts` in English and Arabic (French stays
 * supported but is not fixtured). Written by `pnpm godot:export` (GODOT_EXPORT=1); otherwise the committed files are compared,
 * so a stale file fails the tests. The shipped sprites and their anchors are copied for Godot and checked here too.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BUILDING_IDS } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { compactJson } from "../../../packages/rules/src/export/compact-json.ts";
import manifest from "../src/art/manifest.json";
import { spriteInfo, type SpriteInfo } from "../src/art/art.ts";
import { artPack } from "../src/art/pack.ts";
import { formatAmount, formatDuration } from "../src/format.ts";
import { changeLanguage, initI18n } from "../src/i18n/i18n.ts";
import type { Language } from "../src/i18n/languages.ts";
import {
  baseSpan,
  fitBase,
  GRID_SIZE,
  isoToWorld,
  mapCenter,
  MAP_WORLD_HEIGHT,
  MAP_WORLD_WIDTH,
  PLOTS,
  placeGround,
  placeSprite,
  plotCenter,
  TILE_H,
  TILE_W,
} from "../src/scene/iso-layout.ts";

const godot = (rel: string): URL => new URL(`../../godot/${rel}`, import.meta.url);
const sprites = (): Record<string, unknown> => {
  const keys = [...BUILDING_IDS.map((id) => artPack.buildings[id]), artPack.baseGround];
  return Object.fromEntries(keys.map((k) => [k, (manifest as Record<string, unknown>)[k]]));
};
const info = (key: string): SpriteInfo => spriteInfo(key);

const buildLayout = (): unknown => {
  const placed = BUILDING_IDS.map((id) => {
    const key = artPack.buildings[id];
    const plot = PLOTS[id];
    const p = placeSprite(plot, info(key));
    return { id, key, plot, placement: p, width: info(key).w * p.scale };
  });
  const span = baseSpan(placed.map((b) => ({ x: b.placement.x, width: b.width })));
  const fits = [
    { w: 750, h: 1624, px: 2, top: 150, nav: 70 },
    { w: 375, h: 812, px: 1, top: 75, nav: 70 },
    { w: 1080, h: 2400, px: 2.75, top: 160, nav: 76 },
    { w: 800, h: 600, px: 1, top: 40, nav: 0 },
  ].map((c) => ({ ...c, ...(() => { const f = fitBase(c.w, c.h, c.px, { top: c.top, nav: c.nav }, span); return { zoom: f.zoom, cx: f.center.x, cy: f.center.y }; })() }));
  return {
    tileW: TILE_W,
    tileH: TILE_H,
    gridSize: GRID_SIZE,
    mapWorldWidth: MAP_WORLD_WIDTH,
    mapWorldHeight: MAP_WORLD_HEIGHT,
    mapCenter: mapCenter(),
    ground: { key: artPack.baseGround, info: info(artPack.baseGround), placement: placeGround(info(artPack.baseGround)) },
    buildings: placed.map((b) => ({
      id: b.id,
      key: b.key,
      info: info(b.key),
      plot: b.plot,
      plotCenter: plotCenter(b.plot),
      footprint: [
        isoToWorld(b.plot.gx, b.plot.gy),
        isoToWorld(b.plot.gx + b.plot.size, b.plot.gy),
        isoToWorld(b.plot.gx + b.plot.size, b.plot.gy + b.plot.size),
        isoToWorld(b.plot.gx, b.plot.gy + b.plot.size),
      ],
      placement: b.placement,
    })),
    span,
    fits,
  };
};

const AMOUNTS = [0, 5, 12, 999, 1000, 1234, 12345, 123456, 1234567, 12.9, 999999.99, 1_000_000_000];
const DURATIONS = [0, 1, 999, 1000, 1001, 59_000, 60_000, 61_000, 3_599_000, 3_600_000, 3_661_000, 7_200_000, 86_399_000, 90_061_000, 400_000_000];

const buildFormat = async (): Promise<unknown> => {
  const out: Record<string, unknown> = {};
  for (const lang of ["en", "ar"] as const satisfies readonly Language[]) {
    await changeLanguage(lang);
    out[lang] = {
      amounts: AMOUNTS.map((v) => [v, formatAmount(lang, v)]),
      durations: DURATIONS.map((ms) => [ms, formatDuration(ms)]),
    };
  }
  await changeLanguage("en");
  return out;
};

const roundTrip = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
const committed = (rel: string): unknown => JSON.parse(readFileSync(godot(rel), "utf8"));

describe("Godot base fixtures", () => {
  test("data/base-fixtures.json, art/buildings-manifest.json and the sprites are up to date (run `pnpm godot:export`)", async () => {
    // i18n writes the language to the page; there is no page here.
    Object.defineProperty(globalThis, "document", { value: { documentElement: {}, title: "" }, configurable: true });
    await initI18n("en");
    const fixtures = { layout: buildLayout(), format: await buildFormat() };
    if (process.env.GODOT_EXPORT === "1") {
      mkdirSync(new URL("./", godot("data/x")), { recursive: true });
      writeFileSync(godot("data/base-fixtures.json"), `${compactJson(fixtures)}\n`);
      return;
    }
    expect(committed("data/base-fixtures.json")).toEqual(roundTrip(fixtures));
    expect(committed("art/buildings-manifest.json")).toEqual(roundTrip(sprites()));
    for (const key of Object.keys(sprites())) {
      const shipped = readFileSync(new URL(`../public/art/${key}.webp`, import.meta.url));
      expect(readFileSync(godot(`art/${key}.webp`)).equals(shipped), `${key} is copied`).toBe(true);
    }
  });
});
