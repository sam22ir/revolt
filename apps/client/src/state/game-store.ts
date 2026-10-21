import { advance, claimChapter, DEFAULT_BACKGROUND, levelUpHero, recruitHero, startTraining, startUpgrade, type BackgroundId, type BaseState, type BuildingId, type HeroId, type TroopId, type Troops } from "@revolt/rules";
import { ApiError, type AccountView, type Api, type RallyRefusal, type Snapshot } from "../net/api.ts";
import { loadSession, storeSession } from "../net/session.ts";
import { getBackground, setActiveBackground } from "./background.ts";
import { loadState, SAVE_KEY } from "./save.ts";

export type Listener = (state: BaseState, now: number) => void;

export type SyncStatus = "online" | "offline";

/** What the server said to a march or rally. "unreachable" means the request never got an answer. */
export type MarchOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: RallyRefusal | "unreachable" };

/** What the server (or the local rules, before asking it) said to a hero or story action. */
export type ActionOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface GameStore {
  readonly state: () => BaseState;
  /** Server time as best known: the device clock corrected by the server's offset. */
  readonly now: () => number;
  readonly account: () => AccountView;
  /** The background of the account in use; the rules that depend on it (heroes, story) are predicted with it. */
  readonly background: () => BackgroundId;
  readonly status: () => SyncStatus;
  /** Re-predicts the state at the current time and notifies listeners. */
  readonly tick: () => void;
  /** Predicts the upgrade locally, then replaces the prediction with the server's answer. */
  readonly upgrade: (building: BuildingId) => void;
  /** Predicts the training batch locally, then replaces the prediction with the server's answer. */
  readonly train: (troop: TroopId, count: number) => void;
  /**
   * Sends a march at an NPC target. No prediction: the server picks the id and timing.
   * Resolves with the server's verdict; the state is updated from its answer either way.
   */
  readonly march: (target: string, troops: Troops, heroes?: readonly HeroId[]) => Promise<MarchOutcome>;
  /**
   * Starts a rally at an NPC target: the troops leave home at once and the march (with its `rallyId`)
   * waits for the gathering to end. `gather` is one of `RALLY_GATHER_OPTIONS_MS`.
   */
  readonly startRally: (target: string, troops: Troops, gather: number, heroes?: readonly HeroId[]) => Promise<MarchOutcome>;
  /** Joins a gathering rally of the player's alliance with these troops. */
  readonly joinRally: (rally: string, troops: Troops, heroes?: readonly HeroId[]) => Promise<MarchOutcome>;
  /**
   * Recruits a hero. Predicted with the shared rules first; a refusal there is returned without asking the server.
   * Otherwise the prediction shows at once and the server's answer replaces it.
   */
  readonly recruitHero: (hero: HeroId) => Promise<ActionOutcome>;
  readonly levelHero: (hero: HeroId) => Promise<ActionOutcome>;
  /** Claims the current story chapter, predicted the same way. */
  readonly claimChapter: () => Promise<ActionOutcome>;
  /** The device's bearer token; it changes when a Google sign-in switches base. */
  readonly token: () => string;
  /** Called after the session token changed. */
  readonly onSessionChange: (fn: () => void) => () => void;
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
  /**
   * Asks a new player which background to play (GDD §2.2); only called when a new account has to be created, never
   * for a returning device. Absent means Algeria. The caller should remember the answer: opening is retried
   * until the server answers, and the player must not be asked again.
   */
  readonly chooseBackground?: () => Promise<BackgroundId>;
}

/**
 * Opens this device's session: reuses its token, or creates a guest account,
 * importing a pre-M2 local save once. Throws if the server cannot be reached.
 */
const openSession = async ({ api, storage, chooseBackground }: StoreDeps): Promise<Snapshot & { token: string; account: AccountView }> => {
  const token = loadSession(storage);
  if (token !== null) {
    try {
      return { token, ...(await api.getState(token)) };
    } catch (e) {
      // An unknown token (e.g. a wiped local database) starts over as a new guest.
      if (!(e instanceof ApiError && e.status === 401)) throw e;
    }
  }
  // A pre-M2 local save belongs to an Algeria player: it is imported, and nothing is asked.
  const legacy = loadState(storage);
  const background = legacy !== null || chooseBackground === undefined ? DEFAULT_BACKGROUND : await chooseBackground();
  const created = await api.createGuest(legacy, background);
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
  setActiveBackground(getBackground(account));
  let state = session.state;
  let offset = session.now - clock();
  let status: SyncStatus = "online";
  const listeners = new Set<Listener>();
  const sessionListeners = new Set<() => void>();

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
      setActiveBackground(getBackground(account));
      accept(snap);
    } catch {
      offline();
    }
  };

  /** Marches and rallies are not predicted: the server picks the id and timing, so its answer is the new state. */
  const sendIntent = async (send: () => Promise<Snapshot & ({ ok: true } | { ok: false; reason: RallyRefusal })>): Promise<MarchOutcome> => {
    try {
      const res = await send();
      accept(res);
      return res.ok ? { ok: true } : { ok: false, reason: res.reason };
    } catch {
      void resync();
      return { ok: false, reason: "unreachable" };
    }
  };

  /** Predicts a hero or story action with the shared rules, then lets the server's answer replace the prediction. */
  const predicted = async (
    predict: (s: BaseState, at: number) => { ok: true; state: BaseState } | { ok: false; reason: string },
    send: () => Promise<Snapshot & ({ ok: true } | { ok: false; reason: string })>,
  ): Promise<ActionOutcome> => {
    const local = predict(state, now());
    if (!local.ok) return { ok: false, reason: local.reason };
    state = local.state;
    notify();
    try {
      const res = await send();
      accept(res);
      return res.ok ? { ok: true } : { ok: false, reason: res.reason };
    } catch {
      void resync();
      return { ok: false, reason: "unreachable" };
    }
  };

  return {
    state: () => state,
    now,
    account: () => account,
    background: () => getBackground(account),
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
    train: (troop, count) => {
      const predicted = startTraining(state, troop, count, now());
      if (!predicted.ok) return;
      state = predicted.state;
      notify();
      api.train(token, troop, count).then(accept, () => void resync());
    },
    march: (target, troops, heroes = []) => sendIntent(() => api.march(token, target, troops, heroes)),
    startRally: (target, troops, gather, heroes = []) => sendIntent(() => api.rallyStart(token, target, troops, gather, heroes)),
    joinRally: (rally, troops, heroes = []) => sendIntent(() => api.rallyJoin(token, rally, troops, heroes)),
    recruitHero: (hero) => predicted((s, at) => recruitHero(s, hero, at, getBackground(account)), () => api.heroRecruit(token, hero)),
    levelHero: (hero) => predicted((s, at) => levelUpHero(s, hero, at), () => api.heroLevel(token, hero)),
    claimChapter: () => predicted((s, at) => claimChapter(s, at, getBackground(account)), () => api.storyClaim(token)),
    token: () => token,
    onSessionChange: (fn) => {
      sessionListeners.add(fn);
      return () => sessionListeners.delete(fn);
    },
    resync,
    signInWithGoogle: async (idToken) => {
      const res = await api.signInWithGoogle(token, idToken);
      token = res.token;
      storeSession(storage, token);
      account = res.account;
      setActiveBackground(getBackground(account));
      accept(res);
      for (const fn of sessionListeners) fn();
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
};
