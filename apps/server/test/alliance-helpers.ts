import type { AllianceView, HelpRequestView } from "@revolt/rules";
import { body, newGuest, type Json, type Server, type TestRoomSocket } from "./harness.ts";

/** Plenty of guests from one test IP. */
export const MANY_GUESTS = { GUEST_LIMIT_PER_HOUR: "100000" } as const;

export interface Player {
  readonly token: string;
  readonly id: string;
  readonly handle: string;
}

export const player = async (server: Server): Promise<Player> => {
  const g = await newGuest(server);
  return { token: g.token, id: g.res.account.id as string, handle: g.res.account.handle as string };
};

export const call = async (server: Server, p: Player | string, method: string, path: string, b?: unknown): Promise<Json> =>
  body(await server.request(method, path, { token: typeof p === "string" ? p : p.token, body: b }));

export const post = (server: Server, p: Player | string, path: string, b?: unknown): Promise<Json> => call(server, p, "POST", path, b ?? {});

export const mine = async (server: Server, p: Player): Promise<{ alliance: AllianceView | null; help: HelpRequestView[]; now: number }> =>
  (await call(server, p, "GET", "/v1/alliance")) as never;

export const create = (server: Server, p: Player, name = "Free Lands", tag = "FL"): Promise<Json> => post(server, p, "/v1/alliance", { name, tag });

export const join = (server: Server, p: Player, id: string): Promise<Json> => post(server, p, "/v1/alliance/join", { id });

export interface Team {
  readonly leader: Player;
  readonly members: Player[];
  readonly allianceId: string;
}

/** A leader and `n - 1` members, all in one alliance. */
export const team = async (server: Server, n: number, name = "Free Lands", tag = "FL"): Promise<Team> => {
  const leader = await player(server);
  const made = await create(server, leader, name, tag);
  if (!made.ok) throw new Error(`create: ${made.reason}`);
  const allianceId = made.alliance.id as string;
  const members: Player[] = [];
  for (let i = 1; i < n; i++) {
    const m = await player(server);
    const j = await join(server, m, allianceId);
    if (!j.ok) throw new Error(`join: ${j.reason}`);
    members.push(m);
  }
  return { leader, members, allianceId };
};

/** Opens a chat socket for a member of `allianceId`. */
export const connectChat = async (server: Server, p: Player, allianceId: string): Promise<TestRoomSocket> => {
  const res = await server.request("GET", "/v1/alliance/ws", {
    headers: { upgrade: "websocket", "sec-websocket-protocol": `revolt.v1, auth.${p.token}` },
  });
  if (res.status !== 200) throw new Error(`chat connect: ${res.status}`);
  const socket = server.room(allianceId).sockets[Number(res.headers.get("x-test-socket"))];
  if (socket === undefined) throw new Error("no socket");
  return socket;
};

/** Sends a chat frame as this socket. */
export const say = (server: Server, allianceId: string, socket: TestRoomSocket, text: unknown): void =>
  server.room(allianceId).host.onFrame(socket, JSON.stringify({ type: "chat", text }), server.now);
