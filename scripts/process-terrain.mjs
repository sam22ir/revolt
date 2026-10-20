// Cuts the terrain sheets in art/raw/terrain/ into atlases for the world map.
//   ground/<terrain>-<n>.jpg : 3x3 sheets of flat diamond tiles -> one atlas per terrain (20 variants), diamond-masked with a feathered edge
//   props/<kind>-<n>.jpg     : 3x3 sheets of separate objects  -> one atlas per kind, background removed
// Writes apps/client/public/art/terrain/*.webp and apps/client/src/art/terrain-manifest.json. Run: pnpm art:terrain
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(join(root, "apps/client/package.json"))("sharp");
const SRC = join(root, "art/raw/terrain");
const OUT = join(root, "apps/client/public/art/terrain");

const TILE_W = 256; // output ground tile: a 2:1 diamond, TILE_W x TILE_W/2
const VARIANTS = 20;
const FEATHER = 0.18; // fraction of the diamond (0 at its centre, 1 at its edge) over which alpha ramps to 0
const INSET = 0.05; // the diamond is shrunk by this much first, so the generator's dark rim and grey bleed are cut away
const PROP_MAX = 224; // longest side of a prop, px

const load = async (path) => {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};
const px = (im, x, y) => { const i = (y * im.w + x) * 3; return [im.data[i], im.data[i + 1], im.data[i + 2]]; };

/** Bilinear background model of one cell from its four corner patches (the sheet's grey has a gentle gradient). */
const bgModel = (im, c) => {
  const patch = (x0, y0) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 6; x++) { const p = px(im, x, y); r += p[0]; g += p[1]; b += p[2]; n++; }
    return [r / n, g / n, b / n];
  };
  const tl = patch(c.x + 2, c.y + 2), tr = patch(c.x + c.w - 8, c.y + 2), bl = patch(c.x + 2, c.y + c.h - 8), br = patch(c.x + c.w - 8, c.y + c.h - 8);
  return (x, y) => {
    const u = (x - c.x) / c.w, v = (y - c.y) / c.h;
    return [0, 1, 2].map((k) => (tl[k] * (1 - u) + tr[k] * u) * (1 - v) + (bl[k] * (1 - u) + br[k] * u) * v);
  };
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const cells = (im) => {
  const out = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push({ x: Math.round((c * im.w) / 3), y: Math.round((r * im.h) / 3), w: Math.round(im.w / 3), h: Math.round(im.h / 3) });
  return out;
};

/** Foreground mask of a cell: pixels that differ from the background model. */
const foreground = (im, c, thr) => {
  const bg = bgModel(im, c);
  const m = new Uint8Array(c.w * c.h);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) m[y * c.w + x] = dist(px(im, c.x + x, c.y + y), bg(c.x + x, c.y + y)) > thr ? 1 : 0;
  return m;
};

/** Robust bounding box: the first and last row/column holding at least `min` foreground pixels. */
const bbox = (m, w, h, min) => {
  const col = new Uint32Array(w), row = new Uint32Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { col[x]++; row[y]++; }
  const first = (a) => a.findIndex((v) => v >= min);
  const last = (a) => a.length - 1 - [...a].reverse().findIndex((v) => v >= min);
  return { x0: first(col), x1: last(col), y0: first(row), y1: last(row) };
};

const groundTile = async (im, c) => {
  const m = foreground(im, c, 26);
  const b = bbox(m, c.w, c.h, 6);
  const W = b.x1 - b.x0 + 1;
  const H = Math.round(W / 2);
  // The sheet's tiles are slabs; the top surface is the upper W x W/2 part of the box.
  const x0 = c.x + b.x0, y0 = c.y + b.y0;
  const out = Buffer.alloc(TILE_W * (TILE_W / 2) * 4);
  const OH = TILE_W / 2;
  for (let y = 0; y < OH; y++) {
    for (let x = 0; x < TILE_W; x++) {
      const nx = (x + 0.5) / TILE_W * 2 - 1, ny = (y + 0.5) / OH * 2 - 1;
      const d = (Math.abs(nx) + Math.abs(ny)) / (1 - INSET);
      const a = d >= 1 ? 0 : d <= 1 - FEATHER ? 1 : (1 - d) / FEATHER;
      const sx = Math.min(im.w - 1, Math.max(0, Math.round(x0 + ((x + 0.5) / TILE_W) * W)));
      const sy = Math.min(im.h - 1, Math.max(0, Math.round(y0 + ((y + 0.5) / OH) * H)));
      const p = px(im, sx, sy);
      const i = (y * TILE_W + x) * 4;
      out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2]; out[i + 3] = Math.round(a * 255);
    }
  }
  return out;
};

const shadowy = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) < 34;

/** Cut one object out of its cell: flood fill the background from the cell border, soft alpha at the edge, grey shadows kept as black alpha. */
const propObject = (im, c) => {
  const bg = bgModel(im, c);
  const D0 = 14, D1 = 46;
  const { w, h } = c;
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = dist(px(im, c.x + x, c.y + y), bg(c.x + x, c.y + y));
  // Background = pixels close to the model that connect to the border.
  const isBg = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { const i = y * w + x; if (!isBg[i] && d[i] < D1) { isBg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, p = px(im, c.x + x, c.y + y), b = bg(c.x + x, c.y + y);
    let r = p[0], g = p[1], bl = p[2], a = 255;
    if (isBg[i]) {
      const lum = (p[0] + p[1] + p[2]) / 3, blum = (b[0] + b[1] + b[2]) / 3;
      if (d[i] < D0 || !shadowy(p) || lum >= blum) a = 0;
      else { // a contact shadow: darker than the grey around it
        a = Math.min(190, Math.round(((blum - lum) / blum) * 520)); r = g = bl = 20;
      }
    } else if (d[i] < D1) { a = Math.round(255 * Math.max(0, (d[i] - D0) / (D1 - D0))); }
    const o = i * 4; rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = bl; rgba[o + 3] = a;
  }
  return { rgba, w, h };
};

/** Trims transparent borders, finds the object's own pixels (not its shadow) for the anchor, and returns a sharp-ready buffer. */
const trimObject = async ({ rgba, w, h }) => {
  const { data, info } = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 2 }).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};

const connectedLargest = (rgba, w, h) => {
  // keep only the largest opaque-ish component so neighbours' bleed does not widen the trim box
  const seen = new Uint8Array(w * h), comps = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || rgba[s * 4 + 3] < 40) continue;
    const st = [s]; seen[s] = 1; const idx = [];
    while (st.length) {
      const i = st.pop(); idx.push(i); const x = i % w, y = (i / w) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx; if (!seen[j] && rgba[j * 4 + 3] >= 40) { seen[j] = 1; st.push(j); }
      }
    }
    comps.push(idx);
  }
  comps.sort((a, b) => b.length - a.length);
  const keep = new Uint8Array(w * h);
  // a tree group or a rock cluster can be several pieces: keep every component at least 12% of the largest
  for (const c of comps) if (c.length >= comps[0].length * 0.12) for (const i of c) keep[i] = 1;
  // dilate keep by 6 px so soft edges and shadows near kept pieces survive
  const out = Buffer.from(rgba);
  const dil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (keep[y * w + x]) for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) dil[ny * w + nx] = 1; }
  for (let i = 0; i < w * h; i++) if (!dil[i]) out[i * 4 + 3] = 0;
  return out;
};

/** Shelf-packs frames {w,h,buf} into one RGBA atlas; returns the sharp image and frame rects. */
const pack = (frames, atlasW) => {
  let x = 0, y = 0, rowH = 0;
  const rects = [];
  for (const f of frames) {
    if (x + f.w + 2 > atlasW) { x = 0; y += rowH + 2; rowH = 0; }
    rects.push({ x, y, w: f.w, h: f.h }); x += f.w + 2; rowH = Math.max(rowH, f.h);
  }
  return { rects, height: y + rowH };
};

const writeAtlas = async (name, frames, atlasW) => {
  const { rects, height } = pack(frames, atlasW);
  const composites = frames.map((f, i) => ({ input: f.buf, raw: { width: f.w, height: f.h, channels: 4 }, left: rects[i].x, top: rects[i].y }));
  await sharp({ create: { width: atlasW, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites).webp({ quality: 78, alphaQuality: 90, effort: 5 }).toFile(join(OUT, `${name}.webp`));
  return { w: atlasW, h: height, frames: rects.map((r, i) => ({ ...r, ...(frames[i].meta ?? {}) })) };
};

await mkdir(OUT, { recursive: true });
const manifest = { ground: {}, props: {} };

// ---- ground
const groundFiles = (await readdir(join(SRC, "ground"))).filter((f) => f.endsWith(".jpg")).sort();
const terrains = [...new Set(groundFiles.map((f) => f.split("-")[0]))];
for (const t of terrains) {
  const tiles = [];
  for (const f of groundFiles.filter((n) => n.startsWith(`${t}-`))) {
    const im = await load(join(SRC, "ground", f));
    for (const c of cells(im)) tiles.push(await groundTile(im, c));
  }
  // Spread the 20 picks evenly over every tile found, so each sheet contributes.
  const picks = Array.from({ length: Math.min(VARIANTS, tiles.length) }, (_, i) => tiles[Math.floor((i * tiles.length) / VARIANTS)]);
  const frames = picks.map((buf) => ({ buf, w: TILE_W, h: TILE_W / 2 }));
  manifest.ground[t] = await writeAtlas(`ground-${t}`, frames, TILE_W * 4 + 10);
  console.log(`ground ${t}: ${tiles.length} found, ${frames.length} kept`);
}

// ---- props
const propFiles = (await readdir(join(SRC, "props"))).filter((f) => f.endsWith(".jpg")).sort();
const kinds = [...new Set(propFiles.map((f) => f.split("-")[0]))];
for (const k of kinds) {
  const frames = [];
  for (const f of propFiles.filter((n) => n.startsWith(`${k}-`))) {
    const im = await load(join(SRC, "props", f));
    for (const c of cells(im)) {
      const o = propObject(im, c);
      o.rgba = connectedLargest(o.rgba, o.w, o.h);
      const t = await trimObject(o);
      if (t.w < 24 || t.h < 24) continue;
      const scale = Math.min(1, PROP_MAX / Math.max(t.w, t.h));
      const rw = Math.max(1, Math.round(t.w * scale)), rh = Math.max(1, Math.round(t.h * scale));
      const buf = await sharp(t.data, { raw: { width: t.w, height: t.h, channels: 4 } }).resize(rw, rh, { kernel: "lanczos3" }).raw().toBuffer();
      // Anchor: bottom centre of the pixels that are mostly opaque (the object, not its soft shadow).
      let ay = rh - 1;
      for (; ay > 0; ay--) { let n = 0; for (let x = 0; x < rw; x++) if (buf[(ay * rw + x) * 4 + 3] > 200) n++; if (n > 2) break; }
      let sx = 0, sn = 0;
      for (let x = 0; x < rw; x++) if (buf[(ay * rw + x) * 4 + 3] > 200) { sx += x; sn++; }
      frames.push({ buf, w: rw, h: rh, meta: { ax: Math.round(sn ? sx / sn : rw / 2), ay } });
    }
  }
  manifest.props[k] = await writeAtlas(`props-${k}`, frames, 1024);
  console.log(`props ${k}: ${frames.length} objects`);
}
await writeFile(join(root, "apps/client/src/art/terrain-manifest.json"), `${JSON.stringify(manifest)}\n`);
