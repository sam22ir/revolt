import type { AllianceServerMessage, AllianceView, ChatMessage, HelpRequestView } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import type { AccountView, Api, MineReply } from "../src/net/api.ts";
import type { AllianceSocket } from "../src/net/alliance-socket.ts";
import { createAllianceStore, MAX_MESSAGES, mergeMessages } from "../src/state/alliance-store.ts";
import { UNUSED_ALLIANCE_API } from "./fixtures.ts";

const ALLIANCE: AllianceView = {
  id: "al-1",
  name: "Les Frères",
  tag: "LF",
  myRank: "member",
  members: [
    { handle: "ME2345", rank: "member", joinedAt: 1, me: true },
    { handle: "BOSS22", rank: "leader", joinedAt: 0, me: false },
  ],
  maxMembers: 30,
  hq: null,
};

const REQUEST: HelpRequestView = { id: "h1", handle: "BOSS22", kind: "upgrade", endsAt: 100_000, helps: 0, maxHelps: 5, mine: false, helped: false };

const msg = (id: number, handle = "BOSS22", text = `line ${id}`): ChatMessage => ({ id, at: id * 1000, handle, rank: "member", text });

const fakeSocket = () => {
  const handlers = new Set<(m: AllianceServerMessage) => void>();
  const conn = new Set<(c: boolean) => void>();
  const calls: string[] = [];
  let open = false;
  const sent: string[] = [];
  const socket: AllianceSocket = {
    start: () => void calls.push("start"),
    stop: () => void calls.push("stop"),
    restart: () => void calls.push("restart"),
    send: (text) => (open ? (sent.push(text), true) : false),
    connected: () => open,
    onMessage: (fn) => (handlers.add(fn), () => handlers.delete(fn)),
    onConnection: (fn) => (conn.add(fn), () => conn.delete(fn)),
  };
  return {
    socket,
    calls,
    sent,
    emit: (m: AllianceServerMessage) => handlers.forEach((f) => f(m)),
    setOpen: (v: boolean) => {
      open = v;
      conn.forEach((f) => f(v));
    },
  };
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

const setup = (initial: MineReply = { alliance: ALLIANCE, help: [REQUEST], now: 0 }) => {
  let mine = initial;
  let fetches = 0;
  let resyncs = 0;
  const session = new Set<() => void>();
  const api = { ...UNUSED_ALLIANCE_API, getAlliance: async () => (fetches++, mine) } as unknown as Api;
  const account: AccountView = { id: "a", handle: "ME2345", google: null };
  const game = {
    token: () => "tok",
    account: () => account,
    resync: async () => void resyncs++,
    onSessionChange: (fn: () => void) => (session.add(fn), () => session.delete(fn)),
  };
  const s = fakeSocket();
  const store = createAllianceStore({ api, game, socket: s.socket });
  return {
    store,
    s,
    api,
    setMine: (m: MineReply) => (mine = m),
    fetches: () => fetches,
    resyncs: () => resyncs,
    changeSession: () => session.forEach((f) => f()),
  };
};

describe("mergeMessages", () => {
  test("orders by id and drops duplicates, the later copy winning", () => {
    const merged = mergeMessages([msg(3), msg(1)], [msg(2), { ...msg(3), text: "edited" }, msg(1)]);
    expect(merged.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(merged[2]?.text).toBe("edited");
  });

  test("keeps only the newest MAX_MESSAGES", () => {
    const many = Array.from({ length: MAX_MESSAGES + 50 }, (_, i) => msg(i + 1));
    const merged = mergeMessages([], many);
    expect(merged).toHaveLength(MAX_MESSAGES);
    expect(merged[0]?.id).toBe(51);
    expect(merged[MAX_MESSAGES - 1]?.id).toBe(MAX_MESSAGES + 50);
  });
});

describe("alliance store", () => {
  test("start loads the alliance and its help requests and opens the socket", async () => {
    const t = setup();
    t.store.start();
    await flush();
    expect(t.store.alliance()?.name).toBe("Les Frères");
    expect(t.store.help()).toEqual([REQUEST]);
    expect(t.store.loaded()).toBe(true);
    expect(t.s.calls).toEqual(["start"]);
  });

  test("with no alliance the socket is never opened", async () => {
    const t = setup({ alliance: null, help: [], now: 0 });
    t.store.start();
    await flush();
    expect(t.store.alliance()).toBeNull();
    expect(t.store.loaded()).toBe(true);
    expect(t.s.calls).not.toContain("start");
  });

  test("history and live chat merge by id, in order, without duplicates", async () => {
    const t = setup();
    t.store.start();
    await flush();
    t.s.emit({ type: "history", messages: [msg(2), msg(1)] });
    t.s.emit({ type: "chat", message: msg(3) });
    t.s.emit({ type: "chat", message: msg(3) });
    t.s.emit({ type: "history", messages: [msg(1), msg(2), msg(3)] });
    expect(t.store.messages().map((m) => m.id)).toEqual([1, 2, 3]);
  });

  test("chat is capped", async () => {
    const t = setup();
    t.store.start();
    await flush();
    t.s.emit({ type: "history", messages: Array.from({ length: 100 }, (_, i) => msg(i + 1)) });
    for (let i = 101; i <= 320; i++) t.s.emit({ type: "chat", message: msg(i) });
    expect(t.store.messages()).toHaveLength(MAX_MESSAGES);
    expect(t.store.messages().at(-1)?.id).toBe(320);
  });

  test("the first history is read; later live messages from others are unread, own ones are not", async () => {
    const t = setup();
    t.store.start();
    await flush();
    t.s.emit({ type: "history", messages: [msg(1), msg(2)] });
    expect(t.store.unread()).toBe(0);
    t.s.emit({ type: "chat", message: msg(3) });
    t.s.emit({ type: "chat", message: msg(4, "ME2345") });
    t.s.emit({ type: "chat", message: msg(5) });
    expect(t.store.unread()).toBe(2);
    t.store.setChatOpen(true);
    expect(t.store.unread()).toBe(0);
    t.s.emit({ type: "chat", message: msg(6) });
    expect(t.store.unread()).toBe(0);
    t.store.setChatOpen(false);
    t.s.emit({ type: "chat", message: msg(7) });
    expect(t.store.unread()).toBe(1);
  });

  test("members_changed refetches the alliance", async () => {
    const t = setup();
    t.store.start();
    await flush();
    const before = t.fetches();
    t.setMine({ alliance: { ...ALLIANCE, myRank: "officer" }, help: [], now: 1 });
    t.s.emit({ type: "members_changed" });
    await flush();
    expect(t.fetches()).toBe(before + 1);
    expect(t.store.alliance()?.myRank).toBe("officer");
    expect(t.resyncs()).toBe(0);
  });

  test("help_changed refetches and resyncs the player's own base", async () => {
    const t = setup();
    t.store.start();
    await flush();
    const before = t.fetches();
    t.setMine({ alliance: ALLIANCE, help: [{ ...REQUEST, helps: 1 }], now: 1 });
    t.s.emit({ type: "help_changed" });
    await flush();
    expect(t.fetches()).toBe(before + 1);
    expect(t.resyncs()).toBe(1);
    expect(t.store.help()[0]?.helps).toBe(1);
  });

  test("every (re)connect's history triggers a refetch", async () => {
    const t = setup();
    t.store.start();
    await flush();
    const before = t.fetches();
    t.s.emit({ type: "history", messages: [] });
    await flush();
    expect(t.fetches()).toBe(before + 1);
  });

  test("kicked clears everything and does not reopen the socket", async () => {
    const t = setup();
    t.store.start();
    await flush();
    t.s.emit({ type: "history", messages: [msg(1)] });
    t.s.emit({ type: "chat", message: msg(2) });
    t.s.emit({ type: "kicked" });
    expect(t.store.alliance()).toBeNull();
    expect(t.store.help()).toEqual([]);
    expect(t.store.messages()).toEqual([]);
    expect(t.store.unread()).toBe(0);
    expect(t.s.calls.at(-1)).toBe("stop");
  });

  test("a reply that was in flight when the player was kicked is dropped", async () => {
    const t = setup();
    t.store.start();
    t.s.emit({ type: "kicked" });
    await flush();
    expect(t.store.alliance()).toBeNull();
    expect(t.s.calls).not.toContain("start");
  });

  test("a different alliance is a different room: chat does not carry over", async () => {
    const t = setup();
    t.store.start();
    await flush();
    t.s.emit({ type: "history", messages: [msg(1), msg(2)] });
    t.setMine({ alliance: { ...ALLIANCE, id: "al-2" }, help: [], now: 5 });
    t.s.emit({ type: "members_changed" });
    await flush();
    expect(t.store.messages()).toEqual([]);
    t.s.emit({ type: "history", messages: [msg(1, "OTHER2")] });
    expect(t.store.messages().map((m) => m.handle)).toEqual(["OTHER2"]);
  });

  test("a refetch that finds no alliance stops the socket", async () => {
    const t = setup();
    t.store.start();
    await flush();
    t.setMine({ alliance: null, help: [], now: 2 });
    t.s.emit({ type: "members_changed" });
    await flush();
    expect(t.store.alliance()).toBeNull();
    expect(t.s.calls.at(-1)).toBe("stop");
  });

  test("changing session starts over for the new account", async () => {
    const t = setup();
    t.store.start();
    await flush();
    t.s.emit({ type: "history", messages: [msg(1)] });
    t.setMine({ alliance: null, help: [], now: 3 });
    t.changeSession();
    expect(t.store.messages()).toEqual([]);
    await flush();
    expect(t.store.alliance()).toBeNull();
    expect(t.store.loaded()).toBe(true);
  });

  test("socket errors reach chat listeners, and sending needs an open socket", async () => {
    const t = setup();
    const errors: string[] = [];
    t.store.onChatError((e) => errors.push(e));
    t.s.emit({ type: "error", reason: "rate_limited" });
    expect(errors).toEqual(["rate_limited"]);
    expect(t.store.sendChat("hi")).toBe(false);
    t.s.setOpen(true);
    expect(t.store.sendChat("hi")).toBe(true);
    expect(t.s.sent).toEqual(["hi"]);
  });

  test("create and join take the server's alliance and open the socket; refusals carry the reason", async () => {
    const t = setup({ alliance: null, help: [], now: 0 });
    const api = {
      ...UNUSED_ALLIANCE_API,
      getAlliance: async () => ({ alliance: ALLIANCE, help: [], now: 1 }),
      createAlliance: async (_t: string, name: string) =>
        name === "taken" ? { ok: false as const, reason: "name_taken" as const, now: 1 } : { ok: true as const, alliance: ALLIANCE, now: 1 },
      joinAlliance: async () => Promise.reject(new Error("net")),
    } as unknown as Api;
    const s = fakeSocket();
    const store = createAllianceStore({ api, game: { token: () => "t", account: () => ({ id: "a", handle: "ME2345", google: null }), resync: async () => {}, onSessionChange: () => () => {} }, socket: s.socket });
    expect(await store.create("taken", "TK")).toEqual({ ok: false, reason: "name_taken" });
    expect(store.alliance()).toBeNull();
    expect(await store.create("Les Frères", "LF")).toEqual({ ok: true });
    expect(store.alliance()?.tag).toBe("LF");
    expect(s.calls).toContain("start");
    expect(await store.join("x")).toEqual({ ok: false, reason: "unreachable" });
    expect(t.store.alliance()).toBeNull();
  });

  test("asking for help adds the request; own open requests are found by kind", async () => {
    const t = setup();
    t.store.start();
    await flush();
    const own: HelpRequestView = { ...REQUEST, id: "h2", handle: "ME2345", mine: true, kind: "training" };
    const api = { ...UNUSED_ALLIANCE_API, getAlliance: async () => ({ alliance: ALLIANCE, help: [REQUEST], now: 0 }), requestHelp: async () => ({ ok: true as const, request: own, now: 1 }), giveHelp: async () => ({ ok: false as const, reason: "help_full" as const, now: 1 }) } as unknown as Api;
    const s = fakeSocket();
    const store = createAllianceStore({ api, game: { token: () => "t", account: () => ({ id: "a", handle: "ME2345", google: null }), resync: async () => {}, onSessionChange: () => () => {} }, socket: s.socket });
    store.start();
    await flush();
    expect(store.ownRequest("training", 0)).toBeNull();
    expect(await store.requestHelp("training")).toEqual({ ok: true });
    expect(store.ownRequest("training", 0)?.id).toBe("h2");
    expect(store.ownRequest("upgrade", 0)).toBeNull();
    // Once its job is over a request no longer counts.
    expect(store.ownRequest("training", own.endsAt)).toBeNull();
    expect(await store.giveHelp("h1")).toEqual({ ok: false, reason: "help_full" });
  });
});
