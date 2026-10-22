import { liberatedRegions, type MapSnapshot } from "@revolt/rules";
import { regionEdges } from "../scene/region-edges.ts";
import { regionGridFor } from "../scene/region-grid.ts";
import { hex, theme } from "../theme/theme.ts";
import { el } from "./dom.ts";
import { MINIMAP_H, MINIMAP_W, minimapToTile, tileToMinimap, type Pt } from "./minimap-math.ts";

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

  let snap: MapSnapshot | null = null;
  let baseKey = "";
  let corners: readonly Pt[] | null = null;

  const redraw = (): void => {
    if (ctx === null) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
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
    const mine = s.bases.find((b) => b.mine);
    if (mine !== undefined) {
      const p = tileToMinimap(s.size, mine.x + 0.5, mine.y + 0.5);
      g.beginPath();
      g.arc(p.x, p.y, 3, 0, Math.PI * 2);
      g.fillStyle = hex(theme.accent.paper);
      g.fill();
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
      const mine = next.bases.find((b) => b.mine);
      const key = `${next.terrainSeed}|${next.size}|${[...held].sort((a, b) => a - b).join(",")}|${mine?.x},${mine?.y}`;
      if (key === baseKey) return;
      baseKey = key;
      rebuildBase(next, held);
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
