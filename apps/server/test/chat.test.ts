import { CHAT_HISTORY, CHAT_MAX_LENGTH, CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS } from "@revolt/rules";
import { test } from "vitest";
import { MEMBER_RECHECK_MS } from "../src/alliance/room-host.ts";
import { isMemberOf } from "../src/db/alliances.ts";
import { connectChat, MANY_GUESTS, player, post, say, team } from "./alliance-helpers.ts";
import { T0, type Json, type Server } from "./harness.ts";
import { LONG, rows } from "./rows.ts";

const upgrade = (s: Server, token: string | null, extra: Record<string, string> = {}): Promise<Response> =>
  s.request("GET", "/v1/alliance/ws", {
    headers: { upgrade: "websocket", ...(token === null ? {} : { "sec-websocket-protocol": `revolt.v1, auth.${token}` }), ...extra },
  });

const chats = (s: { received: Json[] }): Json[] => s.received.filter((m) => m.type === "chat").map((m) => m.message);

test("chat: connecting and history on connect", async () => {
  await rows(MANY_GUESTS, {
    "members only, with a token in the subprotocol and an allowed origin": async (s, ex) => {
      const t = await team(s, 1);
      const outsider = await player(s);
      ex((await s.request("GET", "/v1/alliance/ws", { token: t.leader.token })).status, "plain request").toBe(426);
      ex((await upgrade(s, null)).status, "no token").toBe(401);
      ex((await upgrade(s, "y".repeat(43))).status, "unknown token").toBe(401);
      ex((await upgrade(s, outsider.token)).status, "not a member").toBe(403);
      ex((await upgrade(s, t.leader.token, { origin: "https://evil.example" })).status, "foreign origin").toBe(403);
      ex((await upgrade(s, t.leader.token, { origin: "http://localhost:4173" })).status, "allowed origin").toBe(200);
    },
    "a new socket gets the history, and nothing else is sent before something happens": async (s, ex) => {
      const t = await team(s, 2);
      const a = await connectChat(s, t.leader, t.allianceId);
      ex(a.received).toEqual([{ type: "history", messages: [] }]);
      say(s, t.allianceId, a, "first");
      const b = await connectChat(s, t.members[0]!, t.allianceId);
      ex(b.received).toEqual([{ type: "history", messages: [{ id: 1, at: T0, handle: t.leader.handle, rank: "leader", text: "first" }] }]);
    },
  });
}, LONG);

test("chat: messages, limits and text safety", async () => {
  await rows(MANY_GUESTS, {
    "a message reaches every connected member in order, stamped by the server with the sender's real name and rank": async (s, ex) => {
      const t = await team(s, 3);
      const [a, b, c] = [await connectChat(s, t.leader, t.allianceId), await connectChat(s, t.members[0]!, t.allianceId), await connectChat(s, t.members[1]!, t.allianceId)];
      s.now = T0 + 5000;
      say(s, t.allianceId, b, "salut");
      say(s, t.allianceId, c, "مرحبا");
      for (const [i, sock] of [a, b, c].entries()) {
        ex(chats(sock), `socket ${i}`).toEqual([
          { id: 1, at: T0 + 5000, handle: t.members[0]!.handle, rank: "member", text: "salut" },
          { id: 2, at: T0 + 5000, handle: t.members[1]!.handle, rank: "member", text: "مرحبا" },
        ]);
      }
    },
    "the client cannot choose its name, rank or time": async (s, ex) => {
      const t = await team(s, 2);
      const a = await connectChat(s, t.members[0]!, t.allianceId);
      s.room(t.allianceId).host.onFrame(a, JSON.stringify({ type: "chat", text: "hi", handle: "ADMIN", rank: "leader", at: 1, id: 99 }), s.now);
      ex(chats(a)).toEqual([{ id: 1, at: T0, handle: t.members[0]!.handle, rank: "member", text: "hi" }]);
    },
    "a message is delivered only to the sender's own alliance": async (s, ex) => {
      const t = await team(s, 1);
      const other = await team(s, 1, "Other", "OT");
      const a = await connectChat(s, t.leader, t.allianceId);
      const o = await connectChat(s, other.leader, other.allianceId);
      say(s, t.allianceId, a, "private");
      ex(chats(o)).toEqual([]);
    },
    "bad text is refused to the sender alone: empty, too long, several lines, bidi or zero-width characters, non-strings": async (s, ex) => {
      const t = await team(s, 2);
      const a = await connectChat(s, t.leader, t.allianceId);
      const b = await connectChat(s, t.members[0]!, t.allianceId);
      const bad: unknown[] = ["", "   ", "x".repeat(CHAT_MAX_LENGTH + 1), "a\nb", "a‮b", "a​b", 5, null, { text: "x" }];
      // Each refusal is one chat event for the rate limit only if it passes validation, so these do not use up the quota.
      for (const text of bad) say(s, t.allianceId, a, text);
      ex(a.received.filter((m) => m.type === "error")).toEqual(bad.map(() => ({ type: "error", reason: "bad_text" })));
      ex(chats(a), "sender sees no chat").toEqual([]);
      ex(chats(b), "others see no chat").toEqual([]);
      say(s, t.allianceId, a, "x".repeat(CHAT_MAX_LENGTH));
      ex(chats(b), "a maximum-length message passes").toHaveLength(1);
    },
    "markup stays text: it is stored and sent exactly as typed": async (s, ex) => {
      const t = await team(s, 1);
      const a = await connectChat(s, t.leader, t.allianceId);
      say(s, t.allianceId, a, "<img src=x onerror=alert(1)> & <b>");
      ex(chats(a)[0]!.text).toBe("<img src=x onerror=alert(1)> & <b>");
    },
    [`at most ${CHAT_RATE_MAX} messages per ${CHAT_RATE_WINDOW_MS / 1000} s per member`]: async (s, ex) => {
      const t = await team(s, 2);
      const a = await connectChat(s, t.leader, t.allianceId);
      const b = await connectChat(s, t.members[0]!, t.allianceId);
      for (let i = 0; i < CHAT_RATE_MAX; i++) say(s, t.allianceId, a, `m${i}`);
      say(s, t.allianceId, a, "too many");
      ex(a.received.at(-1)).toEqual({ type: "error", reason: "rate_limited" });
      ex(chats(b)).toHaveLength(CHAT_RATE_MAX);
      // Another member is not affected, and the sender can talk again when the window has passed.
      say(s, t.allianceId, b, "still fine");
      ex(chats(a), "other member unaffected").toHaveLength(CHAT_RATE_MAX + 1);
      s.now = T0 + CHAT_RATE_WINDOW_MS;
      say(s, t.allianceId, a, "later");
      ex(chats(b).at(-1)?.text, "next window").toBe("later");
    },
    "garbage frames are ignored without an error": async (s, ex) => {
      const t = await team(s, 1);
      const a = await connectChat(s, t.leader, t.allianceId);
      const host = s.room(t.allianceId).host;
      for (const frame of ["not json", "[]", "null", '{"type":"nope"}', "x".repeat(5000), new ArrayBuffer(4) as unknown as string]) host.onFrame(a, frame, s.now);
      ex(a.received).toEqual([{ type: "history", messages: [] }]);
      // A chat frame without text is a real (empty) message: refused to its sender.
      host.onFrame(a, '{"type":"chat"}', s.now);
      ex(a.received.at(-1)).toEqual({ type: "error", reason: "bad_text" });
    },
  });
}, LONG);

test("chat: history, ranks on the wire, no account ids, room ends with the alliance", async () => {
  await rows(MANY_GUESTS, {
    [`keeps only the last ${CHAT_HISTORY} messages to send, and prunes old rows`]: async (s, ex) => {
      const t = await team(s, 1);
      const a = await connectChat(s, t.leader, t.allianceId);
      for (let i = 0; i < CHAT_HISTORY * 2 + 20; i++) {
        s.now = T0 + i * CHAT_RATE_WINDOW_MS;
        say(s, t.allianceId, a, `message ${i}`);
      }
      const late = await connectChat(s, t.leader, t.allianceId);
      const history = (late.received[0] as { messages: Json[] }).messages;
      ex(history).toHaveLength(CHAT_HISTORY);
      ex(history.at(-1)?.text).toBe(`message ${CHAT_HISTORY * 2 + 19}`);
      ex(history.map((m) => m.id), "in order").toEqual([...history.map((m) => m.id)].sort((x, y) => x - y));
      const stored = s.room(t.allianceId).sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM messages")[0]?.n ?? 0;
      ex(stored, "pruned").toBeLessThanOrEqual(CHAT_HISTORY * 2);
    },
    "a promoted member's later messages carry the new rank": async (s, ex) => {
      const t = await team(s, 2);
      const m = t.members[0]!;
      const sock = await connectChat(s, m, t.allianceId);
      say(s, t.allianceId, sock, "before");
      await post(s, t.leader, "/v1/alliance/promote", { handle: m.handle });
      say(s, t.allianceId, sock, "after");
      ex(chats(sock).map((x) => x.rank)).toEqual(["member", "officer"]);
    },
    "no frame the room sends carries an account id": async (s, ex) => {
      const t = await team(s, 2);
      const a = await connectChat(s, t.leader, t.allianceId);
      const b = await connectChat(s, t.members[0]!, t.allianceId);
      say(s, t.allianceId, b, "hello");
      await post(s, t.leader, "/v1/alliance/promote", { handle: t.members[0]!.handle });
      const wire = JSON.stringify([a.received, b.received]);
      for (const p of [t.leader, ...t.members]) ex(wire, `id of ${p.handle}`).not.toContain(p.id);
    },
    "when the alliance ends the room tells everyone and forgets the chat": async (s, ex) => {
      const t = await team(s, 1);
      const a = await connectChat(s, t.leader, t.allianceId);
      say(s, t.allianceId, a, "bye");
      await post(s, t.leader, "/v1/alliance/leave");
      ex(a.received.at(-1)).toEqual({ type: "kicked" });
      ex(s.room(t.allianceId).sql.exec("SELECT * FROM messages")).toEqual([]);
    },
  });
}, LONG);

test("chat: a socket that outlived its membership", async () => {
  await rows(MANY_GUESTS, {
    "a member removed while the room's notice never arrived cannot post, and is cut off": async (s, ex) => {
      const t = await team(s, 3);
      const kicked = t.members[0]!;
      const a = await connectChat(s, kicked, t.allianceId);
      const b = await connectChat(s, t.members[1]!, t.allianceId);
      // The database says they are gone, but the room was never told (the best-effort RPC failed).
      await s.env.DB.prepare("DELETE FROM alliance_members WHERE account_id = ?").bind(kicked.id).run();
      const frame = JSON.stringify({ type: "chat", text: "still here" });
      const isMember = (id: string) => isMemberOf(s.env.DB, id, t.allianceId);
      await s.room(t.allianceId).host.onFrameChecked(a, frame, s.now, isMember);
      ex(a.open).toBe(false);
      ex(a.received.at(-1)).toEqual({ type: "kicked" });
      ex(b.received.filter((m) => m.type === "chat")).toEqual([]);
      // A member still in it posts as before; a database that cannot answer drops the message.
      await s.room(t.allianceId).host.onFrameChecked(b, frame, s.now, isMember);
      ex(b.received.filter((m) => m.type === "chat"), "member still in").toHaveLength(1);
      await s.room(t.allianceId).host.onFrameChecked(b, frame, s.now + 60_000, async () => {
        throw new Error("D1 down");
      });
      ex(b.received.filter((m) => m.type === "chat"), "database down").toHaveLength(1);
    },
    "the database is asked at most once per member per half minute, however many frames arrive": async (s, ex) => {
      const t = await team(s, 2);
      const a = await connectChat(s, t.members[0]!, t.allianceId);
      let asked = 0;
      const isMember = async (): Promise<boolean> => {
        asked++;
        return true;
      };
      const host = s.room(t.allianceId).host;
      for (let i = 0; i < 50; i++) await host.onFrameChecked(a, "garbage", s.now, isMember);
      for (let i = 0; i < 10; i++) await host.onFrameChecked(a, JSON.stringify({ type: "chat", text: `m${i}` }), s.now + i, isMember);
      ex(asked).toBe(1);
      await host.onFrameChecked(a, "garbage", s.now + MEMBER_RECHECK_MS + 1, isMember);
      ex(asked, "after the recheck interval").toBe(2);
    },
  });
}, LONG);
