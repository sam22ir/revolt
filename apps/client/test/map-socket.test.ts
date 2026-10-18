import type { BattleReport, MapSnapshot } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { REPORT, SNAPSHOT } from "./fixtures.ts";
import { createMapSocket, parseMapMessage, RECONNECT_BACKOFF_MS, type SocketCtor, type SocketLike, type Timers } from "../src/net/map-socket.ts";

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  closed = false;
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeSocket.all.push(this);
  }
  close(): void {
    this.closed = true;
  }
  send(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
  drop(): void {
    this.onclose?.({} as CloseEvent);
  }
}

/** Timers that only run when the test says so. */
const fakeTimers = () => {
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

const setup = (token = "abc") => {
  FakeSocket.all = [];
  const ft = fakeTimers();
  const socket = createMapSocket({ url: "ws://x/v1/map/ws", token: () => token, socket: FakeSocket as SocketCtor, timers: ft.timers });
  const last = (): FakeSocket => {
    const s = FakeSocket.all[FakeSocket.all.length - 1];
    if (s === undefined) throw new Error("no socket");
    return s;
  };
  return { socket, ft, last };
};

describe("parseMapMessage", () => {
  test("reads the three server messages", () => {
    expect(parseMapMessage(JSON.stringify({ type: "map", snapshot: SNAPSHOT }))).toEqual({ type: "map", snapshot: SNAPSHOT });
    expect(parseMapMessage(JSON.stringify({ type: "report", report: REPORT }))).toEqual({ type: "report", report: REPORT });
    expect(parseMapMessage(JSON.stringify({ type: "base_changed", now: 5 }))).toEqual({ type: "base_changed", now: 5 });
  });

  test("drops anything malformed", () => {
    for (const bad of [
      "not json",
      "null",
      "[]",
      JSON.stringify({ type: "nope" }),
      JSON.stringify({ type: "map" }),
      JSON.stringify({ type: "map", snapshot: { size: 64 } }),
      JSON.stringify({ type: "report", report: { id: 1 } }),
      JSON.stringify({ type: "base_changed" }),
      new ArrayBuffer(4),
      undefined,
    ]) {
      expect(parseMapMessage(bad)).toBeNull();
    }
  });
});

describe("map socket", () => {
  test("connects with the protocol and token, and delivers messages", () => {
    const { socket, last } = setup("tok_en-1");
    const snaps: MapSnapshot[] = [];
    const reports: BattleReport[] = [];
    let changed = 0;
    socket.onSnapshot((s) => snaps.push(s));
    socket.onReport((r) => reports.push(r));
    socket.onBaseChanged(() => changed++);
    socket.start();
    expect(last().url).toBe("ws://x/v1/map/ws");
    expect(last().protocols).toEqual(["revolt.v1", "auth.tok_en-1"]);
    last().send(JSON.stringify({ type: "map", snapshot: SNAPSHOT }));
    last().send(JSON.stringify({ type: "report", report: REPORT }));
    last().send(JSON.stringify({ type: "base_changed", now: 1 }));
    expect(snaps).toEqual([SNAPSHOT]);
    expect(reports).toEqual([REPORT]);
    expect(changed).toBe(1);
  });

  test("ignores malformed frames without dropping the connection", () => {
    const { socket, last } = setup();
    const snaps: MapSnapshot[] = [];
    socket.onSnapshot((s) => snaps.push(s));
    socket.start();
    last().send("{oops");
    last().send(JSON.stringify({ type: "map", snapshot: { size: "big" } }));
    last().send(JSON.stringify({ type: "map", snapshot: SNAPSHOT }));
    expect(snaps).toHaveLength(1);
    expect(last().closed).toBe(false);
  });

  test("reconnects with growing backoff, and a good frame resets it", () => {
    const { socket, ft, last } = setup();
    socket.start();
    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      last().drop();
      delays.push(ft.fire());
    }
    expect(delays).toEqual(RECONNECT_BACKOFF_MS.slice(0, 3));
    expect(FakeSocket.all).toHaveLength(4);
    last().send(JSON.stringify({ type: "base_changed", now: 1 }));
    last().drop();
    expect(ft.fire()).toBe(RECONNECT_BACKOFF_MS[0]);
  });

  test("the backoff stops growing at its last step", () => {
    const { socket, ft, last } = setup();
    socket.start();
    let delay = 0;
    for (let i = 0; i < RECONNECT_BACKOFF_MS.length + 3; i++) {
      last().drop();
      delay = ft.fire();
    }
    expect(delay).toBe(RECONNECT_BACKOFF_MS[RECONNECT_BACKOFF_MS.length - 1]);
  });

  test("a refused constructor retries instead of throwing", () => {
    FakeSocket.all = [];
    const ft = fakeTimers();
    let fail = true;
    class Flaky extends FakeSocket {
      constructor(url: string, protocols: string[]) {
        if (fail) throw new Error("blocked");
        super(url, protocols);
      }
    }
    const socket = createMapSocket({ url: "ws://x", token: () => "t", socket: Flaky as SocketCtor, timers: ft.timers });
    socket.start();
    expect(ft.pending.size).toBe(1);
    fail = false;
    ft.fire();
    expect(FakeSocket.all).toHaveLength(1);
  });

  test("stop closes the socket and cancels the retry", () => {
    const { socket, ft, last } = setup();
    socket.start();
    const first = last();
    last().drop();
    expect(ft.pending.size).toBe(1);
    socket.stop();
    expect(ft.pending.size).toBe(0);
    socket.start();
    const second = last();
    socket.stop();
    expect(second.closed).toBe(true);
    expect(first).not.toBe(second);
    // A late close from a stopped socket must not reconnect.
    second.drop();
    expect(ft.pending.size).toBe(0);
  });

  test("restart reconnects at once with the current token", () => {
    FakeSocket.all = [];
    const ft = fakeTimers();
    let token = "old";
    const socket = createMapSocket({ url: "ws://x", token: () => token, socket: FakeSocket as SocketCtor, timers: ft.timers });
    socket.start();
    token = "new";
    socket.restart();
    expect(FakeSocket.all).toHaveLength(2);
    expect(FakeSocket.all[0]?.closed).toBe(true);
    expect(FakeSocket.all[1]?.protocols).toEqual(["revolt.v1", "auth.new"]);
  });

  test("unsubscribed listeners are not called", () => {
    const { socket, last } = setup();
    let n = 0;
    const off = socket.onSnapshot(() => n++);
    socket.start();
    off();
    last().send(JSON.stringify({ type: "map", snapshot: SNAPSHOT }));
    expect(n).toBe(0);
  });
});
