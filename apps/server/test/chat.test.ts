import { CHAT_HISTORY, CHAT_MAX_LENGTH, CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { connectChat, MANY_GUESTS, player, post, say, team } from "./alliance-helpers.ts";
import { startServer, T0, type Json, type Server } from "./harness.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer(MANY_GUESTS);
});
afterEach(() => server.dispose());

const upgrade = (token: string | null, extra: Record<string, string> = {}): Promise<Response> =>
  server.request("GET", "/v1/alliance/ws", {
    headers: { upgrade: "websocket", ...(token === null ? {} : { "sec-websocket-protocol": `revolt.v1, auth.${token}` }), ...extra },
  });

const chats = (s: { received: Json[] }): Json[] => s.received.filter((m) => m.type === "chat").map((m) => m.message);

describe("connecting", () => {
  test("members only, with a token in the subprotocol and an allowed origin", async () => {
    const t = await team(server, 1);
    const outsider = await player(server);
    expect((await server.request("GET", "/v1/alliance/ws", { token: t.leader.token })).status).toBe(426);
    expect((await upgrade(null)).status).toBe(401);
    expect((await upgrade("y".repeat(43))).status).toBe(401);
    expect((await upgrade(outsider.token)).status).toBe(403);
    expect((await upgrade(t.leader.token, { origin: "https://evil.example" })).status).toBe(403);
    expect((await upgrade(t.leader.token, { origin: "http://localhost:4173" })).status).toBe(200);
  });

  test("a new socket gets the history, and nothing else is sent before something happens", async () => {
    const t = await team(server, 2);
    const a = await connectChat(server, t.leader, t.allianceId);
    expect(a.received).toEqual([{ type: "history", messages: [] }]);
    say(server, t.allianceId, a, "first");
    const b = await connectChat(server, t.members[0]!, t.allianceId);
    expect(b.received).toEqual([{ type: "history", messages: [{ id: 1, at: T0, handle: t.leader.handle, rank: "leader", text: "first" }] }]);
  });
});

describe("chatting", () => {
  test("a message reaches every connected member in order, stamped by the server with the sender's real name and rank", async () => {
    const t = await team(server, 3);
    const [a, b, c] = [await connectChat(server, t.leader, t.allianceId), await connectChat(server, t.members[0]!, t.allianceId), await connectChat(server, t.members[1]!, t.allianceId)];
    server.now = T0 + 5000;
    say(server, t.allianceId, b, "salut");
    say(server, t.allianceId, c, "مرحبا");
    for (const s of [a, b, c]) {
      expect(chats(s)).toEqual([
        { id: 1, at: T0 + 5000, handle: t.members[0]!.handle, rank: "member", text: "salut" },
        { id: 2, at: T0 + 5000, handle: t.members[1]!.handle, rank: "member", text: "مرحبا" },
      ]);
    }
  });

  test("the client cannot choose its name, rank or time", async () => {
    const t = await team(server, 2);
    const a = await connectChat(server, t.members[0]!, t.allianceId);
    server.room(t.allianceId).host.onFrame(a, JSON.stringify({ type: "chat", text: "hi", handle: "ADMIN", rank: "leader", at: 1, id: 99 }), server.now);
    expect(chats(a)).toEqual([{ id: 1, at: T0, handle: t.members[0]!.handle, rank: "member", text: "hi" }]);
  });

  test("a message is delivered only to the sender's own alliance", async () => {
    const t = await team(server, 1);
    const other = await team(server, 1, "Other", "OT");
    const a = await connectChat(server, t.leader, t.allianceId);
    const o = await connectChat(server, other.leader, other.allianceId);
    say(server, t.allianceId, a, "private");
    expect(chats(o)).toEqual([]);
  });

  test("bad text is refused to the sender alone: empty, too long, several lines, bidi or zero-width characters, non-strings", async () => {
    const t = await team(server, 2);
    const a = await connectChat(server, t.leader, t.allianceId);
    const b = await connectChat(server, t.members[0]!, t.allianceId);
    const bad: unknown[] = ["", "   ", "x".repeat(CHAT_MAX_LENGTH + 1), "a\nb", "a‮b", "a​b", 5, null, { text: "x" }];
    // Each refusal is one chat event for the rate limit only if it passes validation, so these do not use up the quota.
    for (const text of bad) say(server, t.allianceId, a, text);
    expect(a.received.filter((m) => m.type === "error")).toEqual(bad.map(() => ({ type: "error", reason: "bad_text" })));
    expect(chats(a)).toEqual([]);
    expect(chats(b)).toEqual([]);
    say(server, t.allianceId, a, "x".repeat(CHAT_MAX_LENGTH));
    expect(chats(b)).toHaveLength(1);
  });

  test("markup stays text: it is stored and sent exactly as typed", async () => {
    const t = await team(server, 1);
    const a = await connectChat(server, t.leader, t.allianceId);
    say(server, t.allianceId, a, "<img src=x onerror=alert(1)> & <b>");
    expect(chats(a)[0]!.text).toBe("<img src=x onerror=alert(1)> & <b>");
  });

  test(`at most ${CHAT_RATE_MAX} messages per ${CHAT_RATE_WINDOW_MS / 1000} s per member`, async () => {
    const t = await team(server, 2);
    const a = await connectChat(server, t.leader, t.allianceId);
    const b = await connectChat(server, t.members[0]!, t.allianceId);
    for (let i = 0; i < CHAT_RATE_MAX; i++) say(server, t.allianceId, a, `m${i}`);
    say(server, t.allianceId, a, "too many");
    expect(a.received.at(-1)).toEqual({ type: "error", reason: "rate_limited" });
    expect(chats(b)).toHaveLength(CHAT_RATE_MAX);
    // Another member is not affected, and the sender can talk again when the window has passed.
    say(server, t.allianceId, b, "still fine");
    expect(chats(a)).toHaveLength(CHAT_RATE_MAX + 1);
    server.now = T0 + CHAT_RATE_WINDOW_MS;
    say(server, t.allianceId, a, "later");
    expect(chats(b).at(-1)?.text).toBe("later");
  });

  test("garbage frames are ignored without an error", async () => {
    const t = await team(server, 1);
    const a = await connectChat(server, t.leader, t.allianceId);
    const host = server.room(t.allianceId).host;
    for (const frame of ["not json", "[]", "null", '{"type":"nope"}', "x".repeat(5000), new ArrayBuffer(4) as unknown as string]) host.onFrame(a, frame, server.now);
    expect(a.received).toEqual([{ type: "history", messages: [] }]);
    // A chat frame without text is a real (empty) message: refused to its sender.
    host.onFrame(a, '{"type":"chat"}', server.now);
    expect(a.received.at(-1)).toEqual({ type: "error", reason: "bad_text" });
  });
});

describe("history", () => {
  test(`keeps only the last ${CHAT_HISTORY} messages to send, and prunes old rows`, async () => {
    const t = await team(server, 1);
    const a = await connectChat(server, t.leader, t.allianceId);
    for (let i = 0; i < CHAT_HISTORY * 2 + 20; i++) {
      server.now = T0 + i * CHAT_RATE_WINDOW_MS;
      say(server, t.allianceId, a, `message ${i}`);
    }
    const late = await connectChat(server, t.leader, t.allianceId);
    const history = (late.received[0] as { messages: Json[] }).messages;
    expect(history).toHaveLength(CHAT_HISTORY);
    expect(history.at(-1)?.text).toBe(`message ${CHAT_HISTORY * 2 + 19}`);
    expect(history.map((m) => m.id)).toEqual([...history.map((m) => m.id)].sort((x, y) => x - y));
    const rows = server.room(t.allianceId).sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM messages")[0]?.n ?? 0;
    expect(rows).toBeLessThanOrEqual(CHAT_HISTORY * 2);
  });

  test("a promoted member's later messages carry the new rank", async () => {
    const t = await team(server, 2);
    const m = t.members[0]!;
    const sock = await connectChat(server, m, t.allianceId);
    say(server, t.allianceId, sock, "before");
    await post(server, t.leader, "/v1/alliance/promote", { handle: m.handle });
    say(server, t.allianceId, sock, "after");
    expect(chats(sock).map((x) => x.rank)).toEqual(["member", "officer"]);
  });

  test("no frame the room sends carries an account id", async () => {
    const t = await team(server, 2);
    const a = await connectChat(server, t.leader, t.allianceId);
    const b = await connectChat(server, t.members[0]!, t.allianceId);
    say(server, t.allianceId, b, "hello");
    await post(server, t.leader, "/v1/alliance/promote", { handle: t.members[0]!.handle });
    const wire = JSON.stringify([a.received, b.received]);
    for (const p of [t.leader, ...t.members]) expect(wire).not.toContain(p.id);
  });

  test("when the alliance ends the room tells everyone and forgets the chat", async () => {
    const t = await team(server, 1);
    const a = await connectChat(server, t.leader, t.allianceId);
    say(server, t.allianceId, a, "bye");
    await post(server, t.leader, "/v1/alliance/leave");
    expect(a.received.at(-1)).toEqual({ type: "kicked" });
    expect(server.room(t.allianceId).sql.exec("SELECT * FROM messages")).toEqual([]);
  });
});
