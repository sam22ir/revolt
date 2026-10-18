import { advance, createBaseState, startUpgrade, type BaseState, type BuildingId, type UpgradeResult } from "@revolt/rules";
import { loadState, storeState } from "./save.ts";

export type Listener = (state: BaseState, now: number) => void;

export interface GameStore {
  readonly state: () => BaseState;
  readonly now: () => number;
  /** Settles the state to the current time and notifies listeners. */
  readonly tick: () => void;
  readonly upgrade: (building: BuildingId) => UpgradeResult;
  readonly save: () => void;
  readonly subscribe: (fn: Listener) => () => void;
}

/** Holds the local state. The clock lives here, never in the rules. */
export const createGameStore = (storage: Storage, clock: () => number): GameStore => {
  let state = advance(loadState(storage) ?? createBaseState(clock()), clock());
  const listeners = new Set<Listener>();

  const notify = (): void => {
    const now = clock();
    for (const fn of listeners) fn(state, now);
  };

  const save = (): void => storeState(storage, state);

  return {
    state: () => state,
    now: clock,
    tick: () => {
      state = advance(state, clock());
      notify();
    },
    upgrade: (building) => {
      const result = startUpgrade(state, building, clock());
      state = result.state;
      if (result.ok) save();
      notify();
      return result;
    },
    save,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
};
