import type { BuildingId } from "@revolt/rules";

export interface BuildingStyle {
  /** Top, left and right face colors. */
  readonly top: number;
  readonly left: number;
  readonly right: number;
  /** Wall height in world pixels at level 1; grows a little per level. */
  readonly height: number;
}

// Placeholder palette (GDD §7: code-drawn art until asset packs are picked).
export const BUILDING_STYLES: Readonly<Record<BuildingId, BuildingStyle>> = {
  hq: { top: 0xc9a46a, left: 0x9c7a46, right: 0x7d5f33, height: 70 },
  farm: { top: 0xa8c070, left: 0x7f9a4c, right: 0x637b38, height: 30 },
  armory: { top: 0x8f9298, left: 0x6c6f75, right: 0x55575c, height: 46 },
  treasury: { top: 0xd8c27a, left: 0xb39b52, right: 0x8f7a3b, height: 40 },
  barracks: { top: 0xb08a6a, left: 0x8a6646, right: 0x6e4f34, height: 36 },
};
