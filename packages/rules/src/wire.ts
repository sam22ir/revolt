/**
 * Shapes the server sends and the client reads for the world map (M3). Types only.
 * The server owns every number in them.
 */
import type { MapPoint, MarchResult } from "./base-state.ts";
import type { NpcKind } from "./data/npcs.ts";
import type { Resources } from "./resources.ts";
import type { Troops } from "./troops.ts";

export interface MapBaseView extends MapPoint {
  /** Short public tag for a camp; account ids are never sent to other players. */
  readonly tag: string;
  readonly mine: boolean;
}

export interface MapNpcView extends MapPoint {
  readonly id: string;
  readonly kind: NpcKind;
  readonly level: number;
}

export const MARCH_PHASES = ["outbound", "returning"] as const;
export type MarchPhase = (typeof MARCH_PHASES)[number];

export interface MapMarchView {
  readonly id: string;
  readonly mine: boolean;
  readonly from: MapPoint;
  readonly to: MapPoint;
  readonly departAt: number;
  readonly arriveAt: number;
  readonly returnAt: number;
}

export interface MapSnapshot {
  readonly map: string;
  /** Seed for `terrainAt`. */
  readonly terrainSeed: number;
  readonly size: number;
  readonly bases: readonly MapBaseView[];
  readonly npcs: readonly MapNpcView[];
  readonly marches: readonly MapMarchView[];
  /** Server time, epoch ms. */
  readonly now: number;
}

/** A battle report, delivered when a march arrives. */
export interface BattleReport {
  readonly id: string;
  /** Epoch ms of the battle. */
  readonly at: number;
  readonly target: { readonly kind: NpcKind | null; readonly level: number } & MapPoint;
  readonly result: MarchResult;
  readonly sent: Troops;
  readonly survivors: Troops;
  readonly wounded: Troops;
  readonly lost: Troops;
  readonly defenders: Troops;
  readonly defendersKilled: Troops;
  readonly rounds: number;
  readonly loot: Resources;
  /** The battle seed, revealed once the battle is over, so anyone can replay it. */
  readonly seed: number | null;
}

/** Server → client messages on the map WebSocket. */
export type MapServerMessage =
  | { readonly type: "map"; readonly snapshot: MapSnapshot }
  | { readonly type: "report"; readonly report: BattleReport }
  /** The player's base changed on the server (e.g. a battle outcome); fetch `/v1/state` again. */
  | { readonly type: "base_changed"; readonly now: number };
