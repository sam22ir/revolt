import {
  TROOP_IDS,
  type BaseState,
  type BattleReport,
  type BuildingId,
  type MapSnapshot,
  type MarchBlockReason,
  type TrainingBlockReason,
  type TroopId,
  type Troops,
  type UpgradeBlockReason,
} from "@revolt/rules";

export interface AccountView {
  readonly id: string;
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
  readonly getMap: (token: string) => Promise<MapSnapshot>;
  readonly getReports: (token: string) => Promise<ReportsReply>;
  readonly signInWithGoogle: (token: string, idToken: string) => Promise<SessionSnapshot & { readonly switched: boolean }>;
}

export const defaultApiUrl = (): string =>
  import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8787`;

/** The WebSocket address of the map feed for an API base URL (http → ws, https → wss). */
export const mapSocketUrl = (apiUrl: string): string => `${apiUrl.replace(/^http/, "ws")}/v1/map/ws`;

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
    getMap: (token) => call("GET", "/v1/map", token),
    getReports: (token) => call("GET", "/v1/reports", token),
    signInWithGoogle: (token, idToken) => call("POST", "/v1/auth/google", token, { idToken }),
  };
};
