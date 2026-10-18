import type { BaseState, BuildingId, UpgradeBlockReason } from "@revolt/rules";

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
  readonly signInWithGoogle: (token: string, idToken: string) => Promise<SessionSnapshot & { readonly switched: boolean }>;
}

export const defaultApiUrl = (): string =>
  import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8787`;

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
    signInWithGoogle: (token, idToken) => call("POST", "/v1/auth/google", token, { idToken }),
  };
};
