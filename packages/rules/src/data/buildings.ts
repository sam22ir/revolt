import type { BuildingId } from "../building-id.ts";
import type { ResourceId } from "../resource-id.ts";
import type { Resources } from "../resources.ts";

/** One row per level. Row `i` describes level `i + 1`. */
export interface BuildingLevel {
  /** Cost to upgrade *to* this level. Level 1 is free (starting level). */
  readonly cost: Resources;
  /** Upgrade time to reach this level, in seconds. */
  readonly durationSec: number;
  /** Production at this level, per hour. */
  readonly ratePerHour: number;
}

export interface BuildingDef {
  /** The resource this building produces, or null (e.g. the barracks trains troops instead). */
  readonly produces: ResourceId | null;
  readonly levels: readonly BuildingLevel[];
}

export const MAX_BUILDING_LEVEL = 10;

const c = (food: number, materiel: number, funds: number, support = 0): Resources => ({
  food,
  materiel,
  funds,
  support,
});

const FREE = c(0, 0, 0);

// Placeholder balance for M1. The HQ's `support` rate is a stand-in until
// missions exist (GDD §2.3 says support grows from missions and buildings).
export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  hq: {
    produces: "support",
    levels: [
      { cost: FREE, durationSec: 0, ratePerHour: 20 },
      { cost: c(200, 200, 300), durationSec: 60, ratePerHour: 30 },
      { cost: c(500, 500, 700, 50), durationSec: 600, ratePerHour: 40 },
      { cost: c(1000, 1000, 1500, 100), durationSec: 1800, ratePerHour: 55 },
      { cost: c(2000, 2000, 3000, 200), durationSec: 3600, ratePerHour: 70 },
      { cost: c(3500, 3500, 5000, 300), durationSec: 7200, ratePerHour: 90 },
      { cost: c(6000, 6000, 8500, 450), durationSec: 14400, ratePerHour: 110 },
      { cost: c(9500, 9500, 13000, 650), durationSec: 28800, ratePerHour: 135 },
      { cost: c(14000, 14000, 19000, 900), durationSec: 43200, ratePerHour: 160 },
      { cost: c(20000, 20000, 26000, 1200), durationSec: 86400, ratePerHour: 190 },
    ],
  },
  farm: {
    produces: "food",
    levels: [
      { cost: FREE, durationSec: 0, ratePerHour: 120 },
      { cost: c(60, 40, 80), durationSec: 30, ratePerHour: 180 },
      { cost: c(120, 90, 160), durationSec: 120, ratePerHour: 260 },
      { cost: c(240, 180, 320), durationSec: 600, ratePerHour: 360 },
      { cost: c(480, 360, 640), durationSec: 1800, ratePerHour: 480 },
      { cost: c(900, 700, 1200), durationSec: 3600, ratePerHour: 640 },
      { cost: c(1600, 1250, 2200), durationSec: 7200, ratePerHour: 840 },
      { cost: c(2800, 2200, 3800), durationSec: 14400, ratePerHour: 1080 },
      { cost: c(4800, 3800, 6500), durationSec: 28800, ratePerHour: 1380 },
      { cost: c(8000, 6400, 11000), durationSec: 57600, ratePerHour: 1740 },
    ],
  },
  armory: {
    produces: "materiel",
    levels: [
      { cost: FREE, durationSec: 0, ratePerHour: 100 },
      { cost: c(70, 30, 90), durationSec: 30, ratePerHour: 150 },
      { cost: c(150, 70, 180), durationSec: 120, ratePerHour: 220 },
      { cost: c(300, 140, 360), durationSec: 600, ratePerHour: 300 },
      { cost: c(600, 280, 720), durationSec: 1800, ratePerHour: 400 },
      { cost: c(1100, 550, 1350), durationSec: 3600, ratePerHour: 530 },
      { cost: c(1950, 1000, 2400), durationSec: 7200, ratePerHour: 700 },
      { cost: c(3400, 1750, 4200), durationSec: 14400, ratePerHour: 900 },
      { cost: c(5800, 3000, 7100), durationSec: 28800, ratePerHour: 1150 },
      { cost: c(9600, 5000, 12000), durationSec: 57600, ratePerHour: 1450 },
    ],
  },
  treasury: {
    produces: "funds",
    levels: [
      { cost: FREE, durationSec: 0, ratePerHour: 110 },
      { cost: c(70, 60, 40), durationSec: 30, ratePerHour: 165 },
      { cost: c(150, 130, 90), durationSec: 120, ratePerHour: 240 },
      { cost: c(300, 260, 180), durationSec: 600, ratePerHour: 330 },
      { cost: c(600, 520, 360), durationSec: 1800, ratePerHour: 440 },
      { cost: c(1150, 1000, 700), durationSec: 3600, ratePerHour: 580 },
      { cost: c(2000, 1750, 1250), durationSec: 7200, ratePerHour: 760 },
      { cost: c(3500, 3050, 2200), durationSec: 14400, ratePerHour: 980 },
      { cost: c(6000, 5200, 3800), durationSec: 28800, ratePerHour: 1250 },
      { cost: c(10000, 8700, 6400), durationSec: 57600, ratePerHour: 1580 },
    ],
  },
  barracks: {
    produces: null,
    levels: [
      { cost: FREE, durationSec: 0, ratePerHour: 0 },
      { cost: c(80, 80, 60), durationSec: 60, ratePerHour: 0 },
      { cost: c(160, 160, 120), durationSec: 300, ratePerHour: 0 },
      { cost: c(320, 320, 240), durationSec: 900, ratePerHour: 0 },
      { cost: c(640, 640, 480), durationSec: 1800, ratePerHour: 0 },
      { cost: c(1200, 1200, 900), durationSec: 3600, ratePerHour: 0 },
      { cost: c(2100, 2100, 1600), durationSec: 7200, ratePerHour: 0 },
      { cost: c(3600, 3600, 2700), durationSec: 14400, ratePerHour: 0 },
      { cost: c(6000, 6000, 4500), durationSec: 28800, ratePerHour: 0 },
      { cost: c(10000, 10000, 7500), durationSec: 57600, ratePerHour: 0 },
    ],
  },
  // Placeholder balance. The hall gates hero recruitment and caps hero levels (data/hero-progression.ts).
  hero_hall: {
    produces: null,
    levels: [
      { cost: FREE, durationSec: 0, ratePerHour: 0 },
      { cost: c(100, 60, 150), durationSec: 90, ratePerHour: 0 },
      { cost: c(240, 150, 340), durationSec: 420, ratePerHour: 0 },
      { cost: c(480, 300, 680), durationSec: 1200, ratePerHour: 0 },
      { cost: c(900, 580, 1280), durationSec: 2400, ratePerHour: 0 },
      { cost: c(1600, 1050, 2300), durationSec: 4800, ratePerHour: 0 },
      { cost: c(2700, 1800, 3900), durationSec: 9000, ratePerHour: 0 },
      { cost: c(4400, 2950, 6300), durationSec: 16200, ratePerHour: 0 },
      { cost: c(6900, 4650, 9800), durationSec: 28800, ratePerHour: 0 },
      { cost: c(10500, 7100, 15000), durationSec: 57600, ratePerHour: 0 },
    ],
  },
};
