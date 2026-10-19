import type { AllianceRank, AllianceServerMessage } from "@revolt/rules";
import type { ChatRoom } from "./chat-room.ts";

/** One connected member. The host never sees account ids on the wire: only here, to rate-limit and to find sockets. */
export interface RoomSocket {
  readonly accountId: string;
  /** Mutable: the Worker tells the room when a member's rank changes. */
  handle: string;
  rank: AllianceRank;
  send(data: string): void;
  close(code: number, reason: string): void;
}

export interface RoomPorts {
  sockets(): Iterable<RoomSocket>;
  /** Called after a rank change so the runtime can persist it with the socket (hibernation). */
  persist(socket: RoomSocket): void;
}

const WS_POLICY = 1008;
/** How long a membership check in the database is trusted. */
export const MEMBER_RECHECK_MS = 30_000;

/**
 * The room's behaviour, apart from the runtime: what happens on connect, on a chat frame, and when the Worker
 * reports a change. Shared by the Durable Object and the Node tests.
 */
export class RoomHost {
  /** When each member was last confirmed in the database (by account id: socket objects are rebuilt on every event). */
  private readonly checkedAt = new Map<string, number>();

  constructor(
    private readonly chat: ChatRoom,
    private readonly ports: RoomPorts,
  ) {}

  private static frame(msg: AllianceServerMessage): string {
    return JSON.stringify(msg);
  }

  /** A freshly accepted socket gets the history. */
  welcome(socket: RoomSocket): void {
    socket.send(RoomHost.frame({ type: "history", messages: this.chat.history() }));
  }

  /** A frame from a member. Anything that is not a well-formed chat message is ignored; refusals go to the sender only. */
  onFrame(socket: RoomSocket, data: unknown, now: number): void {
    if (typeof data !== "string" || data.length > 2048) return;
    let msg: unknown;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof msg !== "object" || msg === null || (msg as { type?: unknown }).type !== "chat") return;
    const r = this.chat.post(socket, (msg as { text?: unknown }).text, now);
    if (!r.ok) {
      socket.send(RoomHost.frame({ type: "error", reason: r.reason }));
      return;
    }
    this.broadcast({ type: "chat", message: r.message });
  }

  /**
   * `onFrame` after asking the database (the truth) whether the sender is still a member. The Worker's `memberChanged`
   * call is best effort, so a kicked player's socket could otherwise keep posting until it reconnected. A failed lookup
   * drops the message rather than letting it through. A member confirmed within the last 30 s is not asked again.
   */
  async onFrameChecked(socket: RoomSocket, data: unknown, now: number, isMember: (accountId: string) => Promise<boolean>): Promise<void> {
    // At most one database read per member per MEMBER_RECHECK_MS, however many frames arrive: otherwise one
    // member spamming frames could spend the free tier's D1 reads (the chat rate limit comes after this check).
    const checked = this.checkedAt.get(socket.accountId);
    if (checked !== undefined && now >= checked && now - checked < MEMBER_RECHECK_MS) {
      this.onFrame(socket, data, now);
      return;
    }
    let member: boolean;
    try {
      member = await isMember(socket.accountId);
    } catch {
      return;
    }
    if (!member) {
      this.memberChanged(socket.accountId, null);
      return;
    }
    this.checkedAt.set(socket.accountId, now);
    this.onFrame(socket, data, now);
  }

  broadcast(msg: AllianceServerMessage): void {
    const data = RoomHost.frame(msg);
    for (const s of this.ports.sockets()) {
      try {
        s.send(data);
      } catch {
        // A closing socket: its client reconnects and gets the history.
      }
    }
  }

  /** The Worker changed a member: a new rank, or `null` if they left or were removed (their sockets are closed). */
  memberChanged(accountId: string, rank: AllianceRank | null): void {
    if (rank === null) this.checkedAt.delete(accountId);
    for (const s of [...this.ports.sockets()]) {
      if (s.accountId !== accountId) continue;
      if (rank === null) {
        try {
          s.send(RoomHost.frame({ type: "kicked" }));
          s.close(WS_POLICY, "left");
        } catch {
          // Already closed.
        }
      } else {
        s.rank = rank;
        this.ports.persist(s);
      }
    }
  }

  /** The alliance ended: tell everyone, close the sockets and forget the chat. */
  disband(): void {
    for (const s of [...this.ports.sockets()]) this.memberChanged(s.accountId, null);
    this.chat.clear();
  }
}
