/**
 * Shapes the server sends and the client reads for the world map (M3). Types only.
 * The server owns every number in them.
 */
import type { MapPoint, MarchResult } from "./base-state.ts";
import type { NpcKind } from "./data/npcs.ts";
import type { AllianceRank } from "./alliance.ts";
import type { HeroId } from "./hero-id.ts";
import type { HelpKind } from "./help.ts";
import type { CosmeticId, CosmeticSlot } from "./data/cosmetics.ts";
import type { EventId } from "./data/events.ts";
import type { ProductKind, ProductSku } from "./data/store.ts";
import type { LeaderboardId } from "./leaderboard.ts";
import type { Resources } from "./resources.ts";
import type { Troops } from "./troops.ts";

export interface MapBaseView extends MapPoint {
  /** The player's public handle; account ids are never sent to other players. */
  readonly tag: string;
  readonly mine: boolean;
  /** Tag of the player's alliance, or null. */
  readonly alliance: string | null;
}

export interface MapHqView extends MapPoint {
  /** The alliance's tag (ASCII, the only alliance text drawn on the map canvas). */
  readonly tag: string;
  readonly mine: boolean;
}

/** A rally gathering or marching. Only the viewer's own alliance sees its rallies; the seed is never sent. */
export interface RallyView {
  readonly id: string;
  /** Handle of the player who started it. */
  readonly leader: string;
  readonly target: { readonly npcId: string; readonly kind: NpcKind; readonly level: number } & MapPoint;
  /** Epoch ms: joining closes here and the march leaves. */
  readonly gatherUntil: number;
  readonly arriveAt: number;
  readonly returnAt: number;
  readonly participants: number;
  readonly maxParticipants: number;
  /** Whether the viewer has joined. */
  readonly joined: boolean;
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
  readonly hqs: readonly MapHqView[];
  readonly rallies: readonly RallyView[];
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
  /** The heroes that took part, lead first. Present only when the march had heroes. */
  readonly heroes?: readonly HeroId[];
}

/** Server → client messages on the map WebSocket. */
export type MapServerMessage =
  | { readonly type: "map"; readonly snapshot: MapSnapshot }
  | { readonly type: "report"; readonly report: BattleReport }
  /** The player's base changed on the server (e.g. a battle outcome); fetch `/v1/state` again. */
  | { readonly type: "base_changed"; readonly now: number };

// --- Alliances (M4) ---------------------------------------------------------------------------------------
// No wire type here ever carries an account id: players are named by handle, requests and rallies by opaque ids.

export interface AllianceMemberView {
  readonly handle: string;
  readonly rank: AllianceRank;
  /** Epoch ms. */
  readonly joinedAt: number;
  readonly me: boolean;
}

export interface AllianceView {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly myRank: AllianceRank;
  readonly members: readonly AllianceMemberView[];
  readonly maxMembers: number;
  /** Where the alliance HQ stands on the map, or null until the leader places it. */
  readonly hq: MapPoint | null;
}

export interface AllianceListItem {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly members: number;
  readonly maxMembers: number;
}

/** A member's call for help on a running upgrade or training. */
export interface HelpRequestView {
  readonly id: string;
  readonly handle: string;
  readonly kind: HelpKind;
  /** Epoch ms the job ends, shortened by every help. */
  readonly endsAt: number;
  readonly helps: number;
  readonly maxHelps: number;
  readonly mine: boolean;
  /** Whether the viewer already helped this request. */
  readonly helped: boolean;
}

export interface ChatMessage {
  /** Increases by one per message within an alliance's room. */
  readonly id: number;
  /** Epoch ms, server time. */
  readonly at: number;
  readonly handle: string;
  readonly rank: AllianceRank;
  /** Plain text. Render with `textContent` and `dir="auto"`, never as HTML. */
  readonly text: string;
}

/** Server → client messages on the alliance WebSocket. */
export type AllianceServerMessage =
  | { readonly type: "history"; readonly messages: readonly ChatMessage[] }
  | { readonly type: "chat"; readonly message: ChatMessage }
  /** Membership, ranks or HQ changed: fetch `GET /v1/alliance` again. */
  | { readonly type: "members_changed" }
  /** A help request was made or answered: fetch `GET /v1/alliance` again, and `/v1/state` if it was yours. */
  | { readonly type: "help_changed" }
  /** The player is no longer in this alliance; the server closes the socket after this. */
  | { readonly type: "kicked" }
  | { readonly type: "error"; readonly reason: "rate_limited" | "bad_text" };

/** Client → server messages on the alliance WebSocket. */
export type AllianceClientMessage = { readonly type: "chat"; readonly text: string };

// --- Live features (M7) -----------------------------------------------------------------------------------
// Players are named by handle only. Scores, XP and rank are the server's numbers.

export interface EventView {
  /** `id:index`, the name to send back when claiming. */
  readonly key: string;
  readonly id: EventId;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly active: boolean;
  /** The viewer's score and rank in this window (rank is null before the first point). */
  readonly score: number;
  readonly rank: number | null;
  /** Index of the highest reward tier reached, or -1. */
  readonly tier: number;
  readonly tiers: readonly { readonly score: number }[];
  readonly claimed: boolean;
  readonly claimable: boolean;
  /** The event's text is a draft that needs historian review. */
  readonly needsReview: boolean;
}

export interface EventsResponse {
  readonly events: readonly EventView[];
  readonly now: number;
}

export interface LeaderboardEntryView {
  readonly rank: number;
  /** A player's handle, or an alliance's name on the alliance board. */
  readonly name: string;
  readonly score: number;
  readonly mine: boolean;
}

export interface LeaderboardResponse {
  readonly board: LeaderboardId;
  /** For the event board: the window it ranks. */
  readonly event: string | null;
  readonly entries: readonly LeaderboardEntryView[];
  /** The viewer's own place (their alliance's, on the alliance board); rank is null when unranked. */
  readonly me: { readonly rank: number | null; readonly score: number };
  readonly now: number;
}

export interface PassView {
  readonly season: number;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly xp: number;
  readonly tier: number;
  readonly premium: boolean;
  readonly claimedFree: number;
  readonly claimedPremium: number;
  readonly now: number;
}

export interface WalletView {
  readonly speedupTokens: number;
  readonly usedTodayMs: number;
  readonly dailyCapMs: number;
}

export interface ProductView {
  readonly sku: ProductSku;
  readonly kind: ProductKind;
  readonly priceHintUsdCents: number;
  /** Already owned (premium pass this season, a cosmetic), so it cannot be bought again. */
  readonly owned: boolean;
  readonly dailyLimit: number | null;
}

export interface StoreView {
  readonly products: readonly ProductView[];
  readonly wallet: WalletView;
  readonly cosmetics: { readonly owned: readonly CosmeticId[]; readonly equipped: Readonly<Partial<Record<CosmeticSlot, CosmeticId>>> };
  /** Whether this server can check receipts at all (false: the store is browse-only). */
  readonly canRedeem: boolean;
  readonly now: number;
}
