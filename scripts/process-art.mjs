// Turns the cut-out masters in art/raw/<group>/*.png into the phone-sized WebP files the client loads
// (apps/client/public/art/<group>/<name>.webp) and writes apps/client/src/art/manifest.json with each
// sprite's size and measured ground anchors. Run: pnpm art:process. Outputs are committed.
import { mkdir, readdir, writeFile, rm } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "apps/client/package.json"));
const sharp = require("sharp");

/** Output width in px per group (and per-file overrides). Heights follow the aspect ratio. */
const WIDTHS = {
  buildings: 512,
  map: 288,
  ui: 128,
  units: 128,
};
const OVERRIDES = {
  "buildings/ground_tile": 1024,
  "ui/hud_top_bar": 640,
  "ui/resource_food": 96,
  "ui/resource_funds": 96,
  "ui/resource_materiel": 96,
  "ui/resource_support": 96,
  "map/outpost_fort": 320,
  "map/outpost_watch": 320,
  "map/outpost_barracks": 320,
  "ui/hero_frame_common": 256,
  "ui/hero_frame_rare": 256,
  "ui/hero_frame_legendary": 256,
};
const SRC = join(root, "art/raw");
const OUT = join(root, "apps/client/public/art");

/** Ground anchors from the alpha mask: lowest opaque point, and the left/right extremes of the lower 40%. */
const anchors = (alpha, w, h) => {
  const opaque = (x, y) => alpha[y * w + x] > 128;
  let bottomY = -1;
  for (let y = h - 1; y >= 0 && bottomY < 0; y--) for (let x = 0; x < w; x++) if (opaque(x, y)) { bottomY = y; break; }
  const xsAt = (y) => { const xs = []; for (let x = 0; x < w; x++) if (opaque(x, y)) xs.push(x); return xs; };
  const bx = xsAt(bottomY);
  const bottom = { x: Math.round((bx[0] + bx[bx.length - 1]) / 2), y: bottomY };
  let left = { x: w, y: 0 };
  let right = { x: -1, y: 0 };
  for (let y = Math.floor(h * 0.6); y <= bottomY; y++) {
    const xs = xsAt(y);
    if (xs.length === 0) continue;
    if (xs[0] < left.x) left = { x: xs[0], y };
    if (xs[xs.length - 1] > right.x) right = { x: xs[xs.length - 1], y };
  }
  return { bottom, left, right };
};

const manifest = {};
for (const group of await readdir(SRC)) {
  if (!(group in WIDTHS)) continue;
  await rm(join(OUT, group), { recursive: true, force: true });
  await mkdir(join(OUT, group), { recursive: true });
  for (const file of (await readdir(join(SRC, group))).filter((f) => f.endsWith(".png"))) {
    const name = parse(file).name;
    const key = `${group}/${name}`;
    // The world's ground comes from art/raw/terrain (scripts/process-terrain.mjs); the first single-tile terrain art is retired.
    if (name.startsWith("terrain_")) continue;
    const width = OVERRIDES[key] ?? WIDTHS[group];
    const { data, info } = await sharp(join(SRC, group, file))
      .resize({ width, kernel: "lanczos3" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alpha = new Uint8Array(info.width * info.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    // Transparent pixels keep the generator's grey; zero them so scaling never bleeds a light halo in.
    for (let i = 0; i < alpha.length; i++) if (alpha[i] === 0) data.fill(0, i * 4, i * 4 + 3);
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .webp({ quality: 80, alphaQuality: 90, effort: 5 })
      .toFile(join(OUT, group, `${name}.webp`));
    manifest[key] = { w: info.width, h: info.height, ...anchors(alpha, info.width, info.height) };
  }
}
await mkdir(join(root, "apps/client/src/art"), { recursive: true });
await writeFile(join(root, "apps/client/src/art/manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`${Object.keys(manifest).length} sprites`);
