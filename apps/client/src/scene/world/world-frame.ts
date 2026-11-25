import type { MapSnapshot } from "@revolt/rules";
import type { TileRange, View } from "../world-layout.ts";

export interface TileRef {
  readonly x: number;
  readonly y: number;
}

/** Everything a layer needs to paint one frame. Built once per update by the scene. */
export interface WorldFrame {
  readonly view: View;
  readonly snap: MapSnapshot;
  readonly range: TileRange;
  readonly now: number;
  readonly pixelRatio: number;
  readonly selected: TileRef | null;
  readonly snapshotVersion: number;
}

export interface WorldLayer {
  /** Redraws the layer if anything it depends on changed since the last paint. */
  paint(frame: WorldFrame): void;
  /** Forgets the layer's cache key so the next paint redraws it. */
  invalidate(): void;
}
