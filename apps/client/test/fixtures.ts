import type { BattleReport, MapSnapshot } from "@revolt/rules";
import type { Api } from "../src/net/api.ts";

export const SNAPSHOT: MapSnapshot = {
  map: "m",
  terrainSeed: 7,
  size: 64,
  bases: [
    { x: 10, y: 12, tag: "ABC", mine: true, alliance: null },
    { x: 30, y: 8, tag: "XYZ", mine: false, alliance: null },
  ],
  npcs: [
    { id: "npc-1", x: 14, y: 16, kind: "patrol", level: 1 },
    { id: "npc-2", x: 40, y: 40, kind: "outpost", level: 3 },
  ],
  marches: [],
  hqs: [],
  rallies: [],
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

const unused = async (): Promise<never> => {
  throw new Error("unused");
};

/** The alliance and rally calls, for fake Apis in tests that never make them. */
export const UNUSED_ALLIANCE_API: Pick<
  Api,
  | "rallyStart"
  | "rallyJoin"
  | "heroRecruit"
  | "heroLevel"
  | "storyClaim"
  | "searchAlliances"
  | "getAlliance"
  | "createAlliance"
  | "joinAlliance"
  | "leaveAlliance"
  | "memberAction"
  | "placeHq"
  | "requestHelp"
  | "giveHelp"
  | "getEvents"
  | "claimEvent"
  | "getLeaderboard"
  | "getPass"
  | "claimPass"
  | "getStore"
  | "redeem"
  | "equip"
  | "speedUp"
> = {
  rallyStart: unused,
  rallyJoin: unused,
  heroRecruit: unused,
  heroLevel: unused,
  storyClaim: unused,
  searchAlliances: unused,
  getAlliance: unused,
  createAlliance: unused,
  joinAlliance: unused,
  leaveAlliance: unused,
  memberAction: unused,
  placeHq: unused,
  requestHelp: unused,
  giveHelp: unused,
  getEvents: unused,
  claimEvent: unused,
  getLeaderboard: unused,
  getPass: unused,
  claimPass: unused,
  getStore: unused,
  redeem: unused,
  equip: unused,
  speedUp: unused,
};
