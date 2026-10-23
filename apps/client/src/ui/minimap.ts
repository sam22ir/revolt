import { liberatedRegions, MAX_NPC_LEVEL, type MapSnapshot } from "@revolt/rules";
import { regionEdges } from "../scene/region-edges.ts";
import { regionGridFor } from "../scene/region-grid.ts";
import { hex, theme } from "../theme/theme.ts";
import { el } from "./dom.ts";
import { MINIMAP_H, MINIMAP_W, minimapToTile, tileToMinimap, type Pt } from "./minimap-math.ts";

// Dot colours for the overlay. Not in theme.ts: these are only ever drawn here.
const NPC_COLOUR = 0xb4583a; // terracotta: levels 1-3
const NPC_STRONG_COLOUR = 0x6e1a14; // dark red: level 4 (fortified line, alliance rally only)
const OTHER_BASE_COLOUR = 0xa7b6c2; // pale blue-grey: other players' bases

const mix = (h: number, v: number): number => Math.imul(h ^ (v | 0), 16777619) >>> 0;
const hashText = (h: number, s: string): number => {
  let x = mix(h, s.length);
  for (let i = 0; i < s.length; i++) x = mix(x, s.charCodeAt(i));
  return x;
};
/** A cheap fingerprint of the NPC, base and HQ positions that the overlay draws; equal inputs give equal keys. */
const overlayKey = (s: MapSnapshot): number => {
  const mine = s.bases.find((b) => b.mine);
  let h = mix(2166136261, s.size);
  for (const n of s.npcs) h = mix(mix(mix(mix(h, n.x), n.y), n.level), n.kind === "fortified_line" ? 1 : 0);
  for (const b of s.bases) {
    h = mix(mix(mix(h, b.x), b.y), b.mine ? 1 : 0);
    h = hashText(h, b.alliance ?? "");
  }
  for (const q of s.hqs) h = hashText(mix(mix(mix(h, q.x), q.y), q.mine ? 1 : 0), q.tag);
  return hashText(h, mine?.alliance ?? "");
};

export interface Minimap {
  readonly root: HTMLButtonElement;
  /** Redraws the regions and the player's base when the map, the liberated set or the base changed; cheap otherwise. */
  readonly update: (snap: MapSnapshot | null, now: number) => void;
  /** Where the camera looks: the free band's four corners in fractional tile coordinates, or null. */
  readonly setViewport: (corners: readonly Pt[] | null) => void;
  readonly setVisible: (visible: boolean) => void;
  readonly setLabel: (label: string) => void;
}

export interface MinimapDeps {
  /** The player tapped a tile on the minimap. */
  readonly onJump: (tile: Pt) => void;
}

/**
 * A small overview of the whole map (DOM, above the canvas). It is drawn in the map's own orientation and is never
 * mirrored in right-to-left languages: the map does not flip, so neither can its picture. Tap to jump the camera there.
 */
export const createMinimap = (deps: MinimapDeps): Minimap => {
  const root = el("button", "minimap");
  root.type = "button";
  root.dataset.testid = "minimap";
  root.hidden = true;
  const canvas = document.createElement("canvas");
  root.append(canvas);
  const dpr = Math.max(1, Math.min(3, Math.round(window.devicePixelRatio || 1)));
  canvas.width = MINIMAP_W * dpr;
  canvas.height = MINIMAP_H * dpr;
  const ctx = canvas.getContext("2d");
  const base = document.createElement("canvas");
  base.width = canvas.width;
  base.height = canvas.height;
  // The dots (NPCs, bases, HQs) sit on their own overlay so that NPCs moving never rebuild the region base.
  const dots = document.createElement("canvas");
  dots.width = canvas.width;
  dots.height = canvas.height;

  let snap: MapSnapshot | null = null;
  let baseKey = "";
  let dotsKey = -1;
  let corners: readonly Pt[] | null = null;

  const redraw = (): void => {
    if (ctx === null) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(dots, 0, 0);
    if (corners === null || snap === null) return;
    const pts = corners.map((c) => tileToMinimap(snap!.size, c.x, c.y));
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hex(theme.accent.paper);
    ctx.stroke();
    ctx.restore();
  };

  const rebuildBase = (s: MapSnapshot, held: ReadonlySet<number>): void => {
    const g = base.getContext("2d");
    if (g === null) return;
    g.clearRect(0, 0, base.width, base.height);
    g.save();
    g.scale(dpr, dpr);
    const grid = regionGridFor(s.terrainSeed, s.size);
    const heldPath = new Path2D();
    const libPath = new Path2D();
    for (let y = 0; y < s.size; y++) {
      for (let x = 0; x < s.size; x++) {
        const path = held.has(grid[y * s.size + x] ?? -1) ? libPath : heldPath;
        const a = tileToMinimap(s.size, x, y);
        const b = tileToMinimap(s.size, x + 1, y);
        const c = tileToMinimap(s.size, x + 1, y + 1);
        const d = tileToMinimap(s.size, x, y + 1);
        path.moveTo(a.x, a.y);
        path.lineTo(b.x, b.y);
        path.lineTo(c.x, c.y);
        path.lineTo(d.x, d.y);
        path.closePath();
      }
    }
    g.fillStyle = hex(theme.region.held);
    g.strokeStyle = hex(theme.region.held);
    g.lineWidth = 0.5;
    g.fill(heldPath);
    g.stroke(heldPath);
    g.fillStyle = hex(theme.region.liberated);
    g.strokeStyle = hex(theme.region.liberated);
    g.fill(libPath);
    g.stroke(libPath);
    g.lineWidth = 1;
    for (const e of regionEdges(grid, s.size, { x0: 0, x1: s.size - 1, y0: 0, y1: s.size - 1 })) {
      const from = e.side === "right" ? tileToMinimap(s.size, e.x + 1, e.y) : tileToMinimap(s.size, e.x, e.y + 1);
      const to = tileToMinimap(s.size, e.x + 1, e.y + 1);
      g.strokeStyle = held.has(e.a) || held.has(e.b) ? hex(theme.accent.paper) : hex(theme.region.border);
      g.globalAlpha = 0.7;
      g.beginPath();
      g.moveTo(from.x, from.y);
      g.lineTo(to.x, to.y);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.restore();
  };

  /** NPC dots, then other players' bases, alliance bases, HQs, and the player's own base last, on top. */
  const rebuildDots = (s: MapSnapshot): void => {
    const g = dots.getContext("2d");
    if (g === null) return;
    g.clearRect(0, 0, dots.width, dots.height);
    g.save();
    g.scale(dpr, dpr);
    const mine = s.bases.find((b) => b.mine);
    const at = (x: number, y: number): Pt => tileToMinimap(s.size, x + 0.5, y + 0.5);
    const dot = (p: Pt, r: number, fill: number): void => {
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fillStyle = hex(fill);
      g.fill();
    };
    for (const n of s.npcs) {
      const strong = n.level >= MAX_NPC_LEVEL || n.kind === "fortified_line";
      dot(at(n.x, n.y), strong ? 2.4 : 1.5, strong ? NPC_STRONG_COLOUR : NPC_COLOUR);
    }
    const isAlly = (b: { alliance: string | null }): boolean => b.alliance !== null && b.alliance === mine?.alliance;
    for (const b of s.bases) if (!b.mine && !isAlly(b)) dot(at(b.x, b.y), 2, OTHER_BASE_COLOUR);
    for (const b of s.bases) if (!b.mine && isAlly(b)) dot(at(b.x, b.y), 2.2, theme.alliance.own);
    for (const q of s.hqs) {
      const p = at(q.x, q.y);
      g.fillStyle = hex(q.mine ? theme.alliance.own : theme.alliance.other);
      g.fillRect(p.x - 1.6, p.y - 1.6, 3.2, 3.2);
    }
    if (mine !== undefined) {
      const p = at(mine.x, mine.y);
      dot(p, 3, theme.accent.paper);
      g.beginPath();
      g.arc(p.x, p.y, 3, 0, Math.PI * 2);
      g.lineWidth = 1.5;
      g.strokeStyle = hex(theme.alliance.own);
      g.stroke();
    }
    g.restore();
  };

  root.addEventListener("click", (ev) => {
    if (snap === null) return;
    // Enter or Space on the focused button arrives as a click with no position: go to the player's own base.
    if (ev.clientX === 0 && ev.clientY === 0) {
      const mine = snap.bases.find((b) => b.mine);
      if (mine !== undefined) deps.onJump({ x: mine.x, y: mine.y });
      return;
    }
    const r = canvas.getBoundingClientRect();
    const tile = minimapToTile(snap.size, ((ev.clientX - r.left) / r.width) * MINIMAP_W, ((ev.clientY - r.top) / r.height) * MINIMAP_H);
    if (tile !== null) deps.onJump(tile);
  });

  return {
    root,
    update: (next, now) => {
      snap = next;
      if (next === null) return;
      const held = liberatedRegions({ liberations: next.liberations }, now);
      const key = `${next.terrainSeed}|${next.size}|${[...held].sort((a, b) => a - b).join(",")}`;
      const dKey = overlayKey(next);
      if (key === baseKey && dKey === dotsKey) return;
      if (key !== baseKey) {
        baseKey = key;
        rebuildBase(next, held);
      }
      if (dKey !== dotsKey) {
        dotsKey = dKey;
        rebuildDots(next);
      }
      redraw();
    },
    setViewport: (next) => {
      corners = next;
      redraw();
    },
    setVisible: (visible) => {
      root.hidden = !visible;
    },
    setLabel: (label) => root.setAttribute("aria-label", label),
  };
};
