import { advance, startUpgrade, type BaseState, type BuildingId } from "@revolt/rules";
import { ApiError, type AccountView, type Api, type Snapshot } from "../net/api.ts";
import { loadSession, storeSession } from "../net/session.ts";
import { loadState, SAVE_KEY } from "./save.ts";

export type Listener = (state: BaseState, now: number) => void;

export type SyncStatus = "online" | "offline";

export interface GameStore {
  readonly state: () => BaseState;
  /** Server time as best known: the device clock corrected by the server's offset. */
  readonly now: () => number;
  readonly account: () => AccountView;
  readonly status: () => SyncStatus;
  /** Re-predicts the state at the current time and notifies listeners. */
  readonly tick: () => void;
  /** Predicts the upgrade locally, then replaces the prediction with the server's answer. */
  readonly upgrade: (building: BuildingId) => void;
  /** Reloads the state from the server. */
  readonly resync: () => Promise<void>;
  readonly signInWithGoogle: (idToken: string) => Promise<void>;
  readonly subscribe: (fn: Listener) => () => void;
}

interface StoreDeps {
  readonly api: Api;
  readonly storage: Storage;
  /** Device clock. Only used to predict between server answers. */
  readonly clock: () => number;
}

/**
 * Opens this device's session: reuses its token, or creates a guest account,
 * importing a pre-M2 local save once. Throws if the server cannot be reached.
 */
const openSession = async ({ api, storage }: StoreDeps): Promise<Snapshot & { token: string; account: AccountView }> => {
  const token = loadSession(storage);
  if (token !== null) {
    try {
      return { token, ...(await api.getState(token)) };
    } catch (e) {
      // An unknown token (e.g. a wiped local database) starts over as a new guest.
      if (!(e instanceof ApiError && e.status === 401)) throw e;
    }
  }
  const created = await api.createGuest(loadState(storage));
  storeSession(storage, created.token);
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // Blocked storage: nothing was saved to remove.
  }
  return created;
};

/** Connects to the server. The state shown is always the server's, plus local prediction of time passing. */
export const connectGameStore = async (deps: StoreDeps): Promise<GameStore> => {
  const { api, storage, clock } = deps;
  const session = await openSession(deps);
  let token = session.token;
  let account = session.account;
  let state = session.state;
  let offset = session.now - clock();
  let status: SyncStatus = "online";
  const listeners = new Set<Listener>();

  const now = (): number => clock() + offset;
  const notify = (): void => {
    const t = now();
    for (const fn of listeners) fn(state, t);
  };
  const accept = (snap: Snapshot): void => {
    state = snap.state;
    offset = snap.now - clock();
    status = "online";
    notify();
  };
  const offline = (): void => {
    status = "offline";
    notify();
  };

  const resync = async (): Promise<void> => {
    try {
      const snap = await api.getState(token);
      account = snap.account;
      accept(snap);
    } catch {
      offline();
    }
  };

  return {
    state: () => state,
    now,
    account: () => account,
    status: () => status,
    tick: () => {
      state = advance(state, now());
      notify();
    },
    upgrade: (building) => {
      const predicted = startUpgrade(state, building, now());
      if (!predicted.ok) return;
      state = predicted.state;
      notify();
      api.upgrade(token, building).then(accept, () => void resync());
    },
    resync,
    signInWithGoogle: async (idToken) => {
      const res = await api.signInWithGoogle(token, idToken);
      token = res.token;
      storeSession(storage, token);
      account = res.account;
      accept(res);
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
};
