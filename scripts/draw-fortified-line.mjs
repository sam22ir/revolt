// Draws the "fortified line" world-map sprite (art/raw/map/outpost_fort.png) as an isometric SVG and renders it with sharp.
// A section of a colonial border line in the 1950s: a double barbed-wire fence with concertina wire between,
// a concrete blockhouse behind sandbags, and a wooden watchtower, on the same earth slab as the other outposts.
// Run: node scripts/draw-fortified-line.mjs, then pnpm art:process.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(join(root, "apps/client/package.json"))("sharp");

// World units: the slab is 10 × 10; K screen px per unit. x = CX + (u − v)·K, y = TOP + (u + v)·K/2 − h·K.
const K = 48;
const W = 20 * K + 40;
const CX = W / 2;
const TOP = 230;
const SLAB = 1.5;
const H = Math.ceil(TOP + 10 * K + SLAB * K + 20);
const P = (u, v, h = 0) => [CX + (u - v) * K, TOP + ((u + v) * K) / 2 - h * K];
const pts = (...ps) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const poly = (fill, ps, extra = "") => `<polygon points="${pts(...ps)}" fill="${fill}" ${extra}/>`;
const INK = "#2b2219";
const edge = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-opacity="0.55"`;

// Deterministic jitter so the sprite is the same on every run.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** An upright box from (u, v) with size du × dv and height h, standing at height h0. */
const box = (u, v, du, dv, h, c, h0 = 0) =>
  [
    poly(c.right, [P(u + du, v, h0), P(u + du, v + dv, h0), P(u + du, v + dv, h0 + h), P(u + du, v, h0 + h)], edge),
    poly(c.left, [P(u, v + dv, h0), P(u + du, v + dv, h0), P(u + du, v + dv, h0 + h), P(u, v + dv, h0 + h)], edge),
    poly(c.top, [P(u, v, h0 + h), P(u + du, v, h0 + h), P(u + du, v + dv, h0 + h), P(u, v + dv, h0 + h)], edge),
  ].join("");

const parts = [];
const add = (depth, svg) => parts.push({ depth, svg });

// Earth slab: textured top, darker sides.
const slab = [
  poly("url(#sideL)", [P(0, 10), P(10, 10), P(10, 10, -SLAB), P(0, 10, -SLAB)], edge),
  poly("url(#sideR)", [P(10, 0), P(10, 10), P(10, 10, -SLAB), P(10, 0, -SLAB)], edge),
  poly("#6f7d42", [P(0, 10), P(10, 10), P(10, 10, -0.18), P(0, 10, -0.18)], 'opacity="0.85"'),
  poly("#5c6a36", [P(10, 0), P(10, 10), P(10, 10, -0.18), P(10, 0, -0.18)], 'opacity="0.85"'),
  poly("url(#sand)", [P(0, 0), P(10, 0), P(10, 10), P(0, 10)], edge),
  poly("url(#grain)", [P(0, 0), P(10, 0), P(10, 10), P(0, 10)], 'opacity="0.55"'),
].join("");

// A dirt track from the blockhouse door to the slab's front edge, and the cleared strip the fences run along.
const ground = [
  poly("#b8925c", [P(0.4, 6.9), P(9.6, 6.9), P(9.6, 9.7), P(0.4, 9.7)], 'opacity="0.7"'),
  poly("#a98252", [P(3.1, 4.6), P(4.0, 4.6), P(4.4, 10), P(3.5, 10)], 'opacity="0.75"'),
].join("");

// Scrub and stones scattered on the earth (behind everything else).
const scrub = [];
for (const [u, v] of [[0.8, 1.2], [1.4, 5.6], [7.0, 3.6], [7.2, 6.3], [6.2, 0.7], [0.6, 4.6], [4.2, 0.5], [0.5, 9.4]]) {
  const [x, y] = P(u, v);
  const r = 9 + rnd() * 6;
  scrub.push(`<ellipse cx="${x}" cy="${y + 3}" rx="${r * 1.3}" ry="${r * 0.45}" fill="#000" opacity="0.18"/>`);
  for (let i = 0; i < 5; i++) {
    const dx = (rnd() - 0.5) * r * 1.4;
    const dy = (rnd() - 0.7) * r;
    scrub.push(`<circle cx="${(x + dx).toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="${(r * (0.45 + rnd() * 0.3)).toFixed(1)}" fill="${["#6f7a45", "#5d6a3a", "#808a52"][i % 3]}" stroke="${INK}" stroke-opacity="0.35"/>`);
  }
}
for (const [u, v] of [[5.6, 1.6], [1.8, 8.3], [9.1, 8.6]]) {
  const [x, y] = P(u, v);
  scrub.push(`<ellipse cx="${x}" cy="${y}" rx="11" ry="7" fill="#9b958a" ${edge}/><ellipse cx="${x - 3}" cy="${y - 3}" rx="5" ry="3" fill="#bdb7aa"/>`);
}
add(-1, slab + ground + scrub.join(""));

// Soft cast shadows (light from the upper left): blockhouse and tower lean their shade down-right.
const shade = (ps) => poly("#2b1d10", ps, 'opacity="0.32" filter="url(#soft)"');
add(1, shade([P(2.2, 4.6), P(5, 4.6), P(5, 2), P(6.9, 3.1), P(6.9, 5.4), P(3.6, 5.4)]));
add(1, shade([P(6.4, 2.2), P(7.7, 2.2), P(9.1, 4.1), P(7.8, 4.1)]));


// Oil drums and crates by the blockhouse.
const drum = (u, v, c) => {
  const [x, y] = P(u, v);
  const r = 9;
  const h = 22;
  return `<rect x="${x - r}" y="${y - h}" width="${2 * r}" height="${h}" fill="${c}" ${edge}/><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.5}" fill="${c}" ${edge}/><ellipse cx="${x}" cy="${y - h}" rx="${r}" ry="${r * 0.5}" fill="#9aa08a" ${edge}/><line x1="${x - r}" y1="${y - h * 0.5}" x2="${x + r}" y2="${y - h * 0.5}" stroke="${INK}" stroke-opacity="0.4"/>`;
};
add(10, drum(6.2, 4.6, "#5d6b47") + drum(6.6, 4.9, "#56633f") + drum(6.15, 5.15, "#66734d"));
add(5, box(0.9, 2.3, 0.6, 0.6, 0.45, { top: "#b08a58", left: "#946f43", right: "#7a5a36" }) + box(1.0, 3.0, 0.55, 0.55, 0.4, { top: "#a8814f", left: "#8b673e", right: "#735433" }) + box(0.95, 2.55, 0.5, 0.5, 0.35, { top: "#b89462", left: "#9a7548", right: "#7f5f3a" }, 0.45));

// Concrete blockhouse: walls, a lighter roof slab with a lip, firing slits, a door facing the track.
const concrete = { top: "#c4bfb3", left: "#a8a396", right: "#87837a" };
let bh = box(2, 2, 3, 2.6, 1.5, concrete);
bh += box(1.85, 1.85, 3.3, 2.9, 0.18, { top: "#d3cec2", left: "#b2ad9f", right: "#918c81" }, 1.5);
for (const u of [2.5, 3.7]) bh += poly("#2a2620", [P(u, 4.6, 0.95), P(u + 0.55, 4.6, 0.95), P(u + 0.55, 4.6, 1.1), P(u, 4.6, 1.1)]);
for (const v of [2.5, 3.6]) bh += poly("#2a2620", [P(5, v, 0.95), P(5, v + 0.5, 0.95), P(5, v + 0.5, 1.1), P(5, v, 1.1)]);
bh += poly("#4a3a2a", [P(3.1, 4.6, 0), P(3.9, 4.6, 0), P(3.9, 4.6, 0.9), P(3.1, 4.6, 0.9)], edge);
// Weathering streaks under the roof lip and a radio mast with guy wires.
for (const u of [2.2, 2.9, 4.4]) bh += poly("#6f6a60", [P(u, 4.6, 1.5), P(u + 0.12, 4.6, 1.5), P(u + 0.1, 4.6, 0.9), P(u + 0.04, 4.6, 0.7)], 'opacity="0.35"');
const mast = P(2.6, 2.6, 1.68);
const mastTop = P(2.6, 2.6, 3.4);
bh += `<line x1="${mast[0]}" y1="${mast[1]}" x2="${mastTop[0]}" y2="${mastTop[1]}" stroke="#3b3631" stroke-width="3"/>`;
for (const [u, v] of [[2.0, 2.4], [3.3, 2.5], [2.5, 3.4]]) {
  const g = P(u, v, 1.68);
  bh += `<line x1="${mastTop[0]}" y1="${mastTop[1]}" x2="${g[0]}" y2="${g[1]}" stroke="#3b3631" stroke-width="1" opacity="0.7"/>`;
}
add(7, bh);

// Sandbag wall in front of the blockhouse: three courses of small rounded bags along two sides.
const bags = [];
const bagRow = (from, to, n) => {
  for (let course = 0; course < 3; course++) {
    for (let i = 0; i < n; i++) {
      const t = (i + (course % 2) * 0.5) / n;
      if (t > 1) continue;
      const u = from[0] + (to[0] - from[0]) * t;
      const v = from[1] + (to[1] - from[1]) * t;
      const [x, y] = P(u, v, course * 0.17 + 0.09);
      bags.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="11" ry="6" fill="${course === 2 ? "#cbb27f" : "#b89c68"}" ${edge}/>`);
    }
  }
};
bagRow([1.3, 5.3], [2.9, 5.3], 6);
bagRow([4.6, 5.3], [5.7, 5.3], 4);
bagRow([5.7, 5.3], [5.7, 1.6], 11);
add(9, bags.join(""));

// Watchtower: four timber legs with cross bracing, a plank platform, a railing and a pitched roof.
const tw = [];
const [tu, tv, ts, th] = [6.4, 0.9, 1.3, 3.6];
const legs = [[tu, tv], [tu + ts, tv], [tu + ts, tv + ts], [tu, tv + ts]];
const timber = (a, b, w = 5, c = "#6b4a2c") => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const [tx, ty] = P(tu + ts / 2, tv + ts / 2);
tw.push(`<ellipse cx="${tx}" cy="${ty + 6}" rx="${ts * K * 1.1}" ry="${ts * K * 0.45}" fill="#000" opacity="0.2"/>`);
for (const [u, v] of legs) tw.push(timber(P(u, v), P(u, v, th), 7, "#5a3d24"));
for (let i = 0; i < 4; i++) {
  const a = legs[i];
  const b = legs[(i + 1) % 4];
  tw.push(timber(P(a[0], a[1], 0.3), P(b[0], b[1], th * 0.55), 3.5, "#7a5634"));
  tw.push(timber(P(a[0], a[1], th * 0.55), P(b[0], b[1], th - 0.1), 3.5, "#7a5634"));
}
const plank = { top: "#9a7048", left: "#7d5a39", right: "#654a30" };
tw.push(box(tu - 0.2, tv - 0.2, ts + 0.4, ts + 0.4, 0.15, plank, th));
for (const [a, b] of [[[tu - 0.2, tv + ts + 0.2], [tu + ts + 0.2, tv + ts + 0.2]], [[tu + ts + 0.2, tv - 0.2], [tu + ts + 0.2, tv + ts + 0.2]]]) {
  tw.push(timber(P(a[0], a[1], th + 0.6), P(b[0], b[1], th + 0.6), 3.5, "#5a3d24"));
  tw.push(poly("#8a6440", [P(a[0], a[1], th + 0.15), P(b[0], b[1], th + 0.15), P(b[0], b[1], th + 0.45), P(a[0], a[1], th + 0.45)], edge));
}
for (const [u, v] of [[tu - 0.2, tv - 0.2], [tu + ts + 0.2, tv - 0.2], [tu + ts + 0.2, tv + ts + 0.2], [tu - 0.2, tv + ts + 0.2]]) tw.push(timber(P(u, v, th + 0.15), P(u, v, th + 1.05), 4, "#5a3d24"));
const apex = P(tu + ts / 2, tv + ts / 2, th + 1.75);
const eave = (u, v) => P(u, v, th + 1.05);
const [e1, e2, e3, e4] = [eave(tu - 0.35, tv - 0.35), eave(tu + ts + 0.35, tv - 0.35), eave(tu + ts + 0.35, tv + ts + 0.35), eave(tu - 0.35, tv + ts + 0.35)];
tw.push(poly("#7a3f2b", [e1, e2, apex], edge), poly("#93503a", [e4, e1, apex], edge), poly("#8c4a33", [e2, e3, apex], edge), poly("#b0623f", [e3, e4, apex], edge));
add(9.6, tw.join(""));

// Double fence along the front: wooden posts, four strands of barbed wire, concertina coils between the fences.
const fence = [];
/** A fence from `from` to `to` (world u, v), posts about a unit apart, four barbed strands. */
const fenceLine = (from, to, depth) => {
  const out = [];
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const n = Math.round(len / 0.95);
  const at = (t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  for (const s of [0.25, 0.45, 0.65, 0.85]) {
    const a = P(...from, s);
    const b = P(...to, s);
    out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#3b3631" stroke-width="1.6" opacity="0.9"/>`);
    for (let t = 0.5 / (n * 4); t < 1; t += 1 / (n * 4)) {
      const [x, y] = P(...at(t), s);
      out.push(`<path d="M${x - 3} ${y - 3} l6 6 M${x + 3} ${y - 3} l-6 6" stroke="#3b3631" stroke-width="1.1"/>`);
    }
  }
  for (let i = 0; i <= n; i++) {
    const p = at(i / n);
    out.push(timber(P(...p), P(...p, 1.0), 5, "#5e4027"), timber(P(...p, 1.0), P(...p, 1.03), 5, "#8a6440"));
  }
  add(depth, out.join(""));
};
/** Concertina coils between the two fences, as tilted loops. */
const coils = (from, to, tilt, depth) => {
  const out = [];
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  for (let d = 0; d <= len; d += 0.42) {
    const t = d / len;
    const [x, y] = P(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, 0.32);
    out.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="13" ry="15" fill="none" stroke="#4a4540" stroke-width="1.6" transform="rotate(${tilt} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
  }
  add(depth, out.join(""));
};
// Inner fence, coils, outer fence: an L along both front edges of the slab, meeting at the front corner.
fenceLine([0.5, 7.9], [7.9, 7.9], 12);
fenceLine([7.9, 7.9], [7.9, 0.5], 12);
coils([0.8, 8.55], [8.55, 8.55], -27, 13);
coils([8.55, 0.8], [8.55, 8.3], 27, 13);
fenceLine([0.5, 9.2], [9.2, 9.2], 14);
fenceLine([9.2, 9.2], [9.2, 0.5], 14);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="sand" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#d8b67c"/><stop offset="1" stop-color="#c39a60"/>
  </linearGradient>
  <filter id="noise" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="3"/>
    <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.2  0 0 0 0.9 -0.25"/>
  </filter>
  <linearGradient id="sideL" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8a6240"/><stop offset="0.5" stop-color="#734f31"/><stop offset="1" stop-color="#5a3c24"/>
  </linearGradient>
  <linearGradient id="sideR" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#6c4b2e"/><stop offset="0.5" stop-color="#5a3d25"/><stop offset="1" stop-color="#45301d"/>
  </linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="paint" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="11" result="wob"/>
    <feDisplacementMap in="SourceGraphic" in2="wob" scale="3" xChannelSelector="R" yChannelSelector="G" result="drawn"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.18" numOctaves="4" seed="5" result="n"/>
    <feColorMatrix in="n" type="saturate" values="0" result="g"/>
    <feComponentTransfer in="g" result="tone">
      <feFuncR type="linear" slope="0.35" intercept="0.72"/><feFuncG type="linear" slope="0.35" intercept="0.72"/><feFuncB type="linear" slope="0.35" intercept="0.72"/>
    </feComponentTransfer>
    <feBlend in="drawn" in2="tone" mode="multiply" result="m"/>
    <feComposite in="m" in2="drawn" operator="in"/>
  </filter>
  <pattern id="grain" patternUnits="userSpaceOnUse" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" filter="url(#noise)"/>
  </pattern>
</defs>
<g filter="url(#paint)">
${parts.sort((a, b) => a.depth - b.depth).map((p) => p.svg).join("\n")}
</g>
</svg>`;

await sharp(Buffer.from(svg)).trim({ threshold: 1 }).png().toFile(join(root, "art/raw/map/outpost_fort.png"));
console.log(`outpost_fort ${W}×${H}`);
