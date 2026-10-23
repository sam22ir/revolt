/** Above 2x the extra pixels cost GPU fill-rate without a visible gain on phones. */
export const MAX_PIXEL_RATIO = 2;

/** The backing-store ratio for a device ratio: at least 1, at most MAX_PIXEL_RATIO; a missing or zero ratio counts as 1. */
export const pixelRatioFor = (devicePixelRatio: number | undefined): number =>
  Math.min(MAX_PIXEL_RATIO, Math.max(1, devicePixelRatio || 1));
