// Writes the generated data the Godot client reads: balance tables, fixtures, .po locales, the terrain art manifest and atlases,
// and the ground fixtures. Run: pnpm godot:export. A test in each package fails when the committed files are stale.
// Node strips the TypeScript types on import. The ground fixtures come from a Vitest file (GODOT_EXPORT=1) because
// the client's ground-decals.ts imports a JSON file that plain node cannot load.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compactJson } from "../packages/rules/src/export/compact-json.ts";
import { buildGodotBalance, buildGodotDisplayFixtures, buildGodotMapFixtures, buildGodotUpgradeFixtures } from "../packages/rules/src/export/godot-data.ts";
import { buildPo, PO_LANGUAGES } from "../apps/client/src/i18n/export-po.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const godot = join(root, "apps", "godot");

const write = (rel, text) => {
  const path = join(godot, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log("wrote", rel);
};

const copy = (from, rel) => {
  const path = join(godot, rel);
  mkdirSync(dirname(path), { recursive: true });
  copyFileSync(join(root, from), path);
  console.log("copied", rel);
};

const json = (value) => `${compactJson(value)}\n`;

write("data/balance.json", json(buildGodotBalance()));
write("data/display-fixtures.json", json(buildGodotDisplayFixtures()));
write("data/map-fixtures.json", json(buildGodotMapFixtures()));
write("data/upgrade-fixtures.json", json(buildGodotUpgradeFixtures()));
for (const lang of PO_LANGUAGES) write(`locale/${lang}.po`, buildPo(lang));

// Terrain art drawn on the map: the frame manifest and the five atlases Phaser actually draws (the ground-*.webp and
// props-terraces.webp atlases are registered there but never drawn, so they are not copied).
copy("apps/client/src/art/terrain-manifest.json", "art/terrain-manifest.json");
for (const name of ["decals", "props-trees", "props-rocks", "props-peaks", "props-scrub"]) copy(`apps/client/public/art/terrain/${name}.webp`, `art/terrain/${name}.webp`);

// Base screen art: the six building sprites and the ground slab, with their measured anchors (the subset of art/manifest.json).
const artManifest = JSON.parse(readFileSync(join(root, "apps/client/src/art/manifest.json"), "utf8"));
const baseKeys = ["hq", "farm", "armory", "treasury", "barracks", "hero_hall", "ground_tile"].map((id) => `buildings/${id}`);
for (const key of baseKeys) copy(`apps/client/public/art/${key}.webp`, `art/${key}.webp`);
write("art/buildings-manifest.json", json(Object.fromEntries(baseKeys.map((k) => [k, artManifest[k]]))));

// Troop medallions: the training card's tiles.
for (const id of buildGodotBalance().troopIds) copy(`apps/client/public/art/units/troop_${id}.webp`, `art/troops/troop_${id}.webp`);

console.log("generating data/base-fixtures.json (vitest)");
execFileSync("pnpm", ["--filter", "@revolt/client", "exec", "vitest", "run", "test/godot-base.test.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GODOT_EXPORT: "1" },
});

console.log("generating data/ground-fixtures.json (vitest)");
execFileSync("pnpm", ["--filter", "@revolt/client", "exec", "vitest", "run", "test/godot-ground.test.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GODOT_EXPORT: "1" },
});

console.log("generating data/report-time-fixtures.json (vitest)");
execFileSync("pnpm", ["--filter", "@revolt/client", "exec", "vitest", "run", "test/godot-report-time.test.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GODOT_EXPORT: "1" },
});

console.log("generating data/training-fixtures.json (vitest)");
execFileSync("pnpm", ["--filter", "@revolt/client", "exec", "vitest", "run", "test/godot-training.test.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GODOT_EXPORT: "1" },
});

console.log("generating data/alliance-fixtures.json (vitest)");
execFileSync("pnpm", ["--filter", "@revolt/client", "exec", "vitest", "run", "test/godot-alliance.test.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GODOT_EXPORT: "1" },
});

console.log("generating data/speedup-fixtures.json (vitest)");
execFileSync("pnpm", ["--filter", "@revolt/client", "exec", "vitest", "run", "test/godot-speedup.test.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GODOT_EXPORT: "1" },
});

console.log("generating data/heroes-fixtures.json (vitest)");
execFileSync("pnpm", ["--filter", "@revolt/client", "exec", "vitest", "run", "test/godot-heroes.test.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GODOT_EXPORT: "1" },
});

console.log("generating data/marches-fixtures.json (vitest)");
execFileSync("pnpm", ["--filter", "@revolt/client", "exec", "vitest", "run", "test/godot-marches.test.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GODOT_EXPORT: "1" },
});

console.log("generating data/rallies-fixtures.json (vitest)");
execFileSync("pnpm", ["--filter", "@revolt/client", "exec", "vitest", "run", "test/godot-rallies.test.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GODOT_EXPORT: "1" },
});

console.log("generating data/march-fixtures.json (vitest)");
execFileSync("pnpm", ["--filter", "@revolt/client", "exec", "vitest", "run", "test/godot-march.test.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GODOT_EXPORT: "1" },
});

console.log("generating data/tile-fixtures.json (vitest)");
execFileSync("pnpm", ["--filter", "@revolt/client", "exec", "vitest", "run", "test/godot-tile.test.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GODOT_EXPORT: "1" },
});
