import { DurableObject } from "cloudflare:workers";
import type { AllianceRank, AllianceServerMessage } from "@revolt/rules";
import type { Env } from "../env.ts";
import { isMemberOf } from "../db/alliances.ts";
import { ChatRoom } from "./chat-room.ts";
import { RoomHost, type RoomSocket } from "./room-host.ts";

/** The subprotocol a client asks for; the 101 answer must echo it (and never the token). */
export const ROOM_PROTOCOL = "revolt.v1";

interface Attachment {
  readonly accountId: string;
  readonly handle: string;
  readonly rank: AllianceRank;
  readonly allianceId: string;
}

/**
 * One alliance's chat room as a SQLite-backed Durable Object, named by the alliance id. Membership lives in D1:
 * the Worker authenticates a member, checks it there, and passes who they are in headers; after a membership
 * change it tells the room over RPC. Sockets use the hibernation API, so an idle room costs no duration.
 * Only chat is stored here (the last messages); a deleted alliance's room is cleared by `disband`.
 */
export class AllianceRoom extends DurableObject<Env> {
  private host: RoomHost | null = null;

  /** Time for message stamps. The e2e build overrides it with the settable test clock. */
  protected async clock(): Promise<number> {
    return Date.now();
  }

  private roomHost(): RoomHost {
    if (this.host !== null) return this.host;
    const chat = new ChatRoom({ exec: (q, ...b) => this.ctx.storage.sql.exec(q, ...b).toArray() as never });
    this.host = new RoomHost(chat, {
      sockets: () => this.sockets(),
      persist: (s) => this.attachmentOf(s).serializeAttachment({ accountId: s.accountId, handle: s.handle, rank: s.rank, allianceId: this.allianceIds.get(s) ?? "" } satisfies Attachment),
    });
    return this.host;
  }

  private ws = new WeakMap<RoomSocket, WebSocket>();
  private allianceIds = new WeakMap<RoomSocket, string>();

  private attachmentOf(s: RoomSocket): WebSocket {
    const sock = this.ws.get(s);
    if (sock === undefined) throw new Error("unknown socket");
    return sock;
  }

  private *sockets(): Iterable<RoomSocket> {
    for (const sock of this.ctx.getWebSockets()) {
      const a = sock.deserializeAttachment() as Attachment | null;
      if (a === null) continue;
      const s: RoomSocket = {
        accountId: a.accountId,
        handle: a.handle,
        rank: a.rank,
        send: (d) => sock.send(d),
        close: (code, reason) => sock.close(code, reason),
      };
      this.ws.set(s, sock);
      this.allianceIds.set(s, a.allianceId);
      yield s;
    }
  }

  /** WebSocket upgrade, already authenticated and checked against D1 by the Worker. */
  override async fetch(req: Request): Promise<Response> {
    const accountId = req.headers.get("x-account-id");
    const handle = req.headers.get("x-handle");
    const rank = req.headers.get("x-rank");
    const allianceId = req.headers.get("x-alliance-id");
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket" || accountId === null || handle === null || allianceId === null || (rank !== "leader" && rank !== "officer" && rank !== "member")) {
      return new Response(null, { status: 400 });
    }
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server, [accountId]);
    server.serializeAttachment({ accountId, handle, rank, allianceId } satisfies Attachment);
    for (const s of this.sockets()) if (this.ws.get(s) === server) this.roomHost().welcome(s);
    return new Response(null, { status: 101, webSocket: client, headers: { "sec-websocket-protocol": ROOM_PROTOCOL } });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const now = await this.clock();
    for (const s of this.sockets()) {
      if (this.ws.get(s) !== ws) continue;
      // The socket's rights were checked when it connected; D1 is the truth, so ask again for each message (one cheap read).
      await this.roomHost().onFrameChecked(s, message, now, (accountId) => isMemberOf(this.env.DB, accountId, this.allianceIds.get(s) ?? ""));
    }
  }

  override webSocketClose(ws: WebSocket): void {
    try {
      ws.close(1000, "closed");
    } catch {
      // Already closed.
    }
  }

  /** RPC from the Worker: a member's rank changed, or they left (`null`). */
  async memberChanged(accountId: string, rank: AllianceRank | null): Promise<void> {
    this.roomHost().memberChanged(accountId, rank);
  }

  /** RPC from the Worker: tell every connected member that something changed. */
  async notify(type: Extract<AllianceServerMessage["type"], "members_changed" | "help_changed">): Promise<void> {
    this.roomHost().broadcast({ type });
  }

  /** RPC from the Worker: the alliance ended. */
  async disband(): Promise<void> {
    this.roomHost().disband();
  }
}
