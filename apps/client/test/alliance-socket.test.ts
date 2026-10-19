import type { AllianceServerMessage, ChatMessage } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { createAllianceSocket, parseAllianceMessage, type AllianceSocketCtor, type AllianceSocketLike } from "../src/net/alliance-socket.ts";
import { RECONNECT_BACKOFF_MS, type Timers } from "../src/net/map-socket.ts";

class FakeSocket implements AllianceSocketLike {
  static all: FakeSocket[] = [];
  onopen: AllianceSocketLike["onopen"] = null;
  onmessage: AllianceSocketLike["onmessage"] = null;
  onclose: AllianceSocketLike["onclose"] = null;
  onerror: AllianceSocketLike["onerror"] = null;
  closed = false;
  sent: string[] = [];
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeSocket.all.push(this);
  }
  close(): void {
    this.closed = true;
  }
  send(data: string): void {
    this.sent.push(data);
  }
  open(): void {
    this.onopen?.({} as Event);
  }
  receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
  drop(): void {
    this.onclose?.({} as CloseEvent);
  }
}

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
    fire: (): number => {
      const [id, t] = [...pending.entries()][0] ?? [];
      if (id === undefined || t === undefined) throw new Error("no timer pending");
      pending.delete(id);
      t.fn();
      return t.ms;
    },
  };
};

const MSG: ChatMessage = { id: 1, at: 100, handle: "ABC234", rank: "member", text: "salam" };

const setup = (token = "abc") => {
  FakeSocket.all = [];
  const ft = fakeTimers();
  const socket = createAllianceSocket({ url: "ws://x/v1/alliance/ws", token: () => token, socket: FakeSocket as AllianceSocketCtor, timers: ft.timers });
  const got: AllianceServerMessage[] = [];
  const connection: boolean[] = [];
  socket.onMessage((m) => got.push(m));
  socket.onConnection((c) => connection.push(c));
  const last = (): FakeSocket => {
    const s = FakeSocket.all[FakeSocket.all.length - 1];
    if (s === undefined) throw new Error("no socket");
    return s;
  };
  return { socket, ft, got, connection, last };
};

describe("parseAllianceMessage", () => {
  test("reads each server message", () => {
    expect(parseAllianceMessage(JSON.stringify({ type: "history", messages: [MSG] }))).toEqual({ type: "history", messages: [MSG] });
    expect(parseAllianceMessage(JSON.stringify({ type: "chat", message: MSG }))).toEqual({ type: "chat", message: MSG });
    for (const type of ["members_changed", "help_changed", "kicked"] as const) {
      expect(parseAllianceMessage(JSON.stringify({ type }))).toEqual({ type });
    }
    expect(parseAllianceMessage(JSON.stringify({ type: "error", reason: "rate_limited" }))).toEqual({ type: "error", reason: "rate_limited" });
  });

  test("drops anything malformed", () => {
    expect(parseAllianceMessage(42)).toBeNull();
    expect(parseAllianceMessage("{nope")).toBeNull();
    expect(parseAllianceMessage("[]")).toBeNull();
    expect(parseAllianceMessage(JSON.stringify({ type: "dance" }))).toBeNull();
    expect(parseAllianceMessage(JSON.stringify({ type: "chat", message: { ...MSG, rank: "king" } }))).toBeNull();
    expect(parseAllianceMessage(JSON.stringify({ type: "chat", message: { ...MSG, text: 5 } }))).toBeNull();
    expect(parseAllianceMessage(JSON.stringify({ type: "history", messages: "x" }))).toBeNull();
    expect(parseAllianceMessage(JSON.stringify({ type: "error", reason: "lol" }))).toBeNull();
  });

  test("a history keeps its good messages and loses the malformed ones", () => {
    const msg = parseAllianceMessage(JSON.stringify({ type: "history", messages: [MSG, { id: "x" }, null, { ...MSG, id: 2 }] }));
    expect(msg).toEqual({ type: "history", messages: [MSG, { ...MSG, id: 2 }] });
  });
});

describe("alliance socket", () => {
  test("connects with the auth subprotocol and reports opening and closing", () => {
    const { socket, last, connection } = setup("tok");
    socket.start();
    expect(last().url).toBe("ws://x/v1/alliance/ws");
    expect(last().protocols).toEqual(["revolt.v1", "auth.tok"]);
    expect(socket.connected()).toBe(false);
    last().open();
    expect(socket.connected()).toBe(true);
    last().drop();
    expect(connection).toEqual([true, false]);
  });

  test("delivers well-formed frames and ignores malformed ones", () => {
    const { socket, last, got } = setup();
    socket.start();
    last().receive("garbage");
    last().receive(JSON.stringify({ type: "chat", message: { ...MSG, rank: "nope" } }));
    last().receive(JSON.stringify({ type: "chat", message: MSG }));
    expect(got).toEqual([{ type: "chat", message: MSG }]);
  });

  test("reconnects with growing backoff, and a live frame resets it", () => {
    const { socket, ft, last } = setup();
    socket.start();
    last().drop();
    expect(ft.fire()).toBe(RECONNECT_BACKOFF_MS[0]);
    last().drop();
    expect(ft.fire()).toBe(RECONNECT_BACKOFF_MS[1]);
    expect(FakeSocket.all).toHaveLength(3);
    last().receive(JSON.stringify({ type: "members_changed" }));
    last().drop();
    expect(ft.fire()).toBe(RECONNECT_BACKOFF_MS[0]);
  });

  test("does not reconnect after kicked, and tells listeners", () => {
    const { socket, ft, last, got } = setup();
    socket.start();
    const first = last();
    first.open();
    first.receive(JSON.stringify({ type: "kicked" }));
    expect(got).toEqual([{ type: "kicked" }]);
    expect(first.closed).toBe(true);
    // The server closes the socket after `kicked`; that close must not bring it back.
    first.drop();
    expect(ft.pending.size).toBe(0);
    expect(FakeSocket.all).toHaveLength(1);
    expect(socket.connected()).toBe(false);
    expect(socket.send("hi")).toBe(false);
  });

  test("start works again after kicked (a new alliance)", () => {
    const { socket, last } = setup();
    socket.start();
    last().receive(JSON.stringify({ type: "kicked" }));
    socket.start();
    expect(FakeSocket.all).toHaveLength(2);
  });

  test("stop closes the socket and cancels the retry", () => {
    const { socket, ft, last } = setup();
    socket.start();
    last().drop();
    expect(ft.pending.size).toBe(1);
    socket.stop();
    expect(ft.pending.size).toBe(0);
    expect(FakeSocket.all).toHaveLength(1);
  });

  test("restart reconnects at once with the current token", () => {
    FakeSocket.all = [];
    let token = "one";
    const socket = createAllianceSocket({ url: "ws://x", token: () => token, socket: FakeSocket as AllianceSocketCtor, timers: fakeTimers().timers });
    socket.start();
    token = "two";
    socket.restart();
    expect(FakeSocket.all).toHaveLength(2);
    expect(FakeSocket.all[0]?.closed).toBe(true);
    expect(FakeSocket.all[1]?.protocols).toEqual(["revolt.v1", "auth.two"]);
  });

  test("sends chat as JSON only while open", () => {
    const { socket, last } = setup();
    expect(socket.send("early")).toBe(false);
    socket.start();
    expect(socket.send("still connecting")).toBe(false);
    last().open();
    expect(socket.send("salam <b>x</b>")).toBe(true);
    expect(last().sent.map((s) => JSON.parse(s))).toEqual([{ type: "chat", text: "salam <b>x</b>" }]);
    last().drop();
    expect(socket.send("late")).toBe(false);
  });
});
