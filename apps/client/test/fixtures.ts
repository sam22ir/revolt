import type { BattleReport, MapSnapshot } from "@revolt/rules";

export const SNAPSHOT: MapSnapshot = {
  map: "m",
  terrainSeed: 7,
  size: 64,
  bases: [
    { x: 10, y: 12, tag: "ABC", mine: true },
    { x: 30, y: 8, tag: "XYZ", mine: false },
  ],
  npcs: [
    { id: "npc-1", x: 14, y: 16, kind: "patrol", level: 1 },
    { id: "npc-2", x: 40, y: 40, kind: "outpost", level: 3 },
  ],
  marches: [],
  now: 1000,
};

export const REPORT: BattleReport = {
  id: "r1",
  at: 5000,
  target: { kind: "patrol", level: 1, x: 3, y: 4 },
  result: "victory",
  sent: { infantry: 5, scouts: 0, heavy: 0, porters: 0 },
  survivors: { infantry: 4, scouts: 0, heavy: 0, porters: 0 },
  wounded: { infantry: 1, scouts: 0, heavy: 0, porters: 0 },
  lost: { infantry: 0, scouts: 0, heavy: 0, porters: 0 },
  defenders: { infantry: 4, scouts: 3, heavy: 0, porters: 0 },
  defendersKilled: { infantry: 4, scouts: 3, heavy: 0, porters: 0 },
  rounds: 2,
  loot: { food: 50, materiel: 0, funds: 0, support: 0 },
  seed: 9,
};
