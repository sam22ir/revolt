import type { Timers } from "../src/net/map-socket.ts";

export const memoryStorage = (init: Record<string, string> = {}): Storage => {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
};

/** Timers that only run when the test says so. */
export const fakeTimers = () => {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  const timers: Timers = {
    set: (fn, ms) => {
      pending.set(next, { fn, ms });
      return next++;
    },
    clear: (h) => void pending.delete(h),
  };
  return {
    timers,
    pending,
    /** Runs the one pending timer and returns the delay it was set with. */
    fire: (): number => {
      const [id, t] = [...pending.entries()][0] ?? [];
      if (id === undefined || t === undefined) throw new Error("no timer pending");
      pending.delete(id);
      t.fn();
      return t.ms;
    },
  };
};
