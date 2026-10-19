import {
  TROOP_IDS,
  type AllianceBlockReason,
  type AllianceListItem,
  type AllianceView,
  type BaseState,
  type BattleReport,
  type BuildingId,
  type HelpKind,
  type HelpRequestView,
  type MapSnapshot,
  type MarchBlockReason,
  type TrainingBlockReason,
  type TroopId,
  type Troops,
  type UpgradeBlockReason,
} from "@revolt/rules";

export interface AccountView {
  readonly id: string;
  /** The public name other players see in member lists, chat and help requests. */
  readonly handle: string;
  readonly google: { readonly email: string | null } | null;
}

export interface Snapshot {
  readonly state: BaseState;
  /** Server time when `state` was computed, epoch ms. */
  readonly now: number;
}

export interface SessionSnapshot extends Snapshot {
  readonly token: string;
  readonly account: AccountView;
}

export type IntentResult = Snapshot & ({ readonly ok: true } | { readonly ok: false; readonly reason: UpgradeBlockReason });

export type TrainReply = Snapshot & ({ readonly ok: true } | { readonly ok: false; readonly reason: TrainingBlockReason });

/** Why the server turned a march down: the shared rules' reasons, or the target vanished first. */
export type MarchRefusal = MarchBlockReason | "target_gone";

export type MarchReply = Snapshot & ({ readonly ok: true } | { readonly ok: false; readonly reason: MarchRefusal });

/** Why a rally start or join was turned down: the march reasons, or the alliance rules'. */
export type RallyRefusal = MarchRefusal | AllianceBlockReason;

export type RallyReply = Snapshot & ({ readonly ok: true } | { readonly ok: false; readonly reason: RallyRefusal });

/** An alliance change: the new alliance (null after leaving), or the reason the rules refused it. */
export type AllianceReply =
  | { readonly ok: true; readonly alliance: AllianceView | null; readonly now: number }
  | { readonly ok: false; readonly reason: AllianceBlockReason; readonly now: number };

export type HelpReply =
  | { readonly ok: true; readonly request: HelpRequestView; readonly now: number }
  | { readonly ok: false; readonly reason: AllianceBlockReason; readonly now: number };

export interface MineReply {
  readonly alliance: AllianceView | null;
  /** Open help requests of the members, the player's own included. */
  readonly help: readonly HelpRequestView[];
  readonly now: number;
}

export interface SearchReply {
  readonly alliances: readonly AllianceListItem[];
  readonly now: number;
}

/** The routes that act on one member, named by handle. */
export const MEMBER_ACTIONS = ["kick", "promote", "demote", "transfer"] as const;
export type MemberAction = (typeof MEMBER_ACTIONS)[number];

export interface ReportsReply {
  /** Newest first, at most 20. */
  readonly reports: readonly BattleReport[];
  readonly now: number;
}

/** The server answered with an error status, e.g. 401 for an unknown token. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

export interface Api {
  readonly createGuest: (importSave: BaseState | null) => Promise<SessionSnapshot>;
  readonly getState: (token: string) => Promise<Snapshot & { readonly account: AccountView }>;
  readonly upgrade: (token: string, building: BuildingId) => Promise<IntentResult>;
  readonly train: (token: string, troop: TroopId, count: number) => Promise<TrainReply>;
  /** Sends a march at an NPC target (by id). */
  readonly march: (token: string, target: string, troops: Troops) => Promise<MarchReply>;
  /** Starts a rally at an NPC target; `gather` is one of `RALLY_GATHER_OPTIONS_MS`. */
  readonly rallyStart: (token: string, target: string, troops: Troops, gather: number) => Promise<RallyReply>;
  readonly rallyJoin: (token: string, rally: string, troops: Troops) => Promise<RallyReply>;
  readonly getMap: (token: string) => Promise<MapSnapshot>;
  readonly getReports: (token: string) => Promise<ReportsReply>;
  readonly signInWithGoogle: (token: string, idToken: string) => Promise<SessionSnapshot & { readonly switched: boolean }>;
  /** Alliances on the player's server whose name starts with `q`. */
  readonly searchAlliances: (token: string, q: string) => Promise<SearchReply>;
  readonly getAlliance: (token: string) => Promise<MineReply>;
  readonly createAlliance: (token: string, name: string, tag: string) => Promise<AllianceReply>;
  readonly joinAlliance: (token: string, id: string) => Promise<AllianceReply>;
  readonly leaveAlliance: (token: string) => Promise<AllianceReply>;
  /** Kick, promote, demote or hand over leadership, by the member's handle. */
  readonly memberAction: (token: string, action: MemberAction, handle: string) => Promise<AllianceReply>;
  readonly placeHq: (token: string, x: number, y: number) => Promise<AllianceReply>;
  readonly requestHelp: (token: string, kind: HelpKind) => Promise<HelpReply>;
  readonly giveHelp: (token: string, requestId: string) => Promise<HelpReply>;
}

export const defaultApiUrl = (): string =>
  import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8787`;

/** The WebSocket address of the map feed for an API base URL (http → ws, https → wss). */
export const mapSocketUrl = (apiUrl: string): string => `${apiUrl.replace(/^http/, "ws")}/v1/map/ws`;

/** The WebSocket address of the alliance chat and change notices. */
export const allianceSocketUrl = (apiUrl: string): string => `${apiUrl.replace(/^http/, "ws")}/v1/alliance/ws`;

/** `{infantry: 5}` rather than all four types: the request names only what leaves. */
export const sentTroops = (troops: Troops): Partial<Record<TroopId, number>> => {
  const out: Partial<Record<TroopId, number>> = {};
  for (const id of TROOP_IDS) if (troops[id] > 0) out[id] = troops[id];
  return out;
};

/** Thin JSON client. The server's answers are trusted; it owns every number. */
export const createApi = (baseUrl: string, fetchFn: typeof fetch = fetch): Api => {
  const call = async <T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> => {
    const headers: Record<string, string> = {};
    if (token !== null) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetchFn(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = typeof json === "object" && json !== null && "error" in json && typeof json.error === "string" ? json.error : "unknown";
      throw new ApiError(res.status, code);
    }
    return json as T;
  };
  return {
    createGuest: (importSave) => call("POST", "/v1/guest", null, importSave === null ? {} : { importSave }),
    getState: (token) => call("GET", "/v1/state", token),
    upgrade: (token, building) => call("POST", "/v1/intent", token, { type: "upgrade", building }),
    train: (token, troop, count) => call("POST", "/v1/intent", token, { type: "train", troop, count }),
    march: (token, target, troops) => call("POST", "/v1/intent", token, { type: "march", target, troops: sentTroops(troops) }),
    rallyStart: (token, target, troops, gather) =>
      call("POST", "/v1/intent", token, { type: "rally_start", target, troops: sentTroops(troops), gather }),
    rallyJoin: (token, rally, troops) => call("POST", "/v1/intent", token, { type: "rally_join", rally, troops: sentTroops(troops) }),
    getMap: (token) => call("GET", "/v1/map", token),
    getReports: (token) => call("GET", "/v1/reports", token),
    signInWithGoogle: (token, idToken) => call("POST", "/v1/auth/google", token, { idToken }),
    searchAlliances: (token, q) => call("GET", `/v1/alliances?q=${encodeURIComponent(q)}`, token),
    getAlliance: (token) => call("GET", "/v1/alliance", token),
    createAlliance: (token, name, tag) => call("POST", "/v1/alliance", token, { name, tag }),
    joinAlliance: (token, id) => call("POST", "/v1/alliance/join", token, { id }),
    leaveAlliance: (token) => call("POST", "/v1/alliance/leave", token, {}),
    memberAction: (token, action, handle) => call("POST", `/v1/alliance/${action}`, token, { handle }),
    placeHq: (token, x, y) => call("POST", "/v1/alliance/hq", token, { x, y }),
    requestHelp: (token, kind) => call("POST", "/v1/help/request", token, { kind }),
    giveHelp: (token, requestId) => call("POST", "/v1/help/give", token, { requestId }),
  };
};
