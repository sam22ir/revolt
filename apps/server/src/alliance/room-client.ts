import type { AllianceRank } from "@revolt/rules";
import type { Env } from "../env.ts";

/**
 * The RPC surface of the AllianceRoom Durable Object, declared here so code outside the DO needs no Workers
 * runtime types (tests run in Node).
 */
export interface RoomStub {
  memberChanged(accountId: string, rank: AllianceRank | null): Promise<void>;
  notify(type: "members_changed" | "help_changed"): Promise<void>;
  disband(): Promise<void>;
  fetch(req: Request): Promise<Response>;
}

/** The slice of `DurableObjectNamespace<AllianceRoom>` we use. */
export interface RoomNamespace {
  idFromName(name: string): unknown;
  get(id: never): RoomStub;
}

export interface RoomMember {
  readonly accountId: string;
  readonly handle: string;
  readonly rank: AllianceRank;
}

/** What the Worker asks of one alliance's room. */
export interface RoomApi {
  /** Hands an authenticated, membership-checked WebSocket upgrade to the room. */
  connect(req: Request, who: RoomMember): Promise<Response>;
  memberChanged(accountId: string, rank: AllianceRank | null): Promise<void>;
  notify(type: "members_changed" | "help_changed"): Promise<void>;
  disband(): Promise<void>;
}

export const durableRoom = (env: Env, allianceId: string): RoomApi => {
  const stub = env.ALLIANCE_ROOM.get(env.ALLIANCE_ROOM.idFromName(allianceId) as never);
  return {
    connect: (req, who) => {
      const headers = new Headers(req.headers);
      headers.set("x-account-id", who.accountId);
      headers.set("x-handle", who.handle);
      headers.set("x-rank", who.rank);
      return stub.fetch(new Request(req.url, { headers }));
    },
    memberChanged: (accountId, rank) => stub.memberChanged(accountId, rank),
    notify: (type) => stub.notify(type),
    disband: () => stub.disband(),
  };
};
