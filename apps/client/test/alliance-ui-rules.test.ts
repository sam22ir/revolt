import { type AllianceMemberView, type MarchState, type RallyView } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { drawableTag, ralliesAt, tileInfo } from "../src/state/tile-info.ts";
import { canHelp } from "../src/ui/alliance-help.ts";
import { memberActions } from "../src/ui/alliance-members.ts";
import { canJoinRally } from "../src/ui/alliance-rallies.ts";
import { marchStage } from "../src/ui/marches-list.ts";
import { SNAPSHOT } from "./fixtures.ts";

const member = (rank: AllianceMemberView["rank"], me = false): AllianceMemberView => ({ handle: "AB2345", rank, joinedAt: 0, me });

describe("memberActions: what the viewer's rank allows", () => {
  test("a leader may remove, promote, demote and hand over, but only where it makes sense", () => {
    expect(memberActions("leader", member("member"))).toEqual(["kick", "promote", "transfer"]);
    expect(memberActions("leader", member("officer"))).toEqual(["kick", "demote", "transfer"]);
  });

  test("an officer may only remove plain members", () => {
    expect(memberActions("officer", member("member"))).toEqual(["kick"]);
    expect(memberActions("officer", member("officer"))).toEqual([]);
    expect(memberActions("officer", member("leader"))).toEqual([]);
  });

  test("a member has no actions, and nobody acts on themselves", () => {
    expect(memberActions("member", member("member"))).toEqual([]);
    expect(memberActions("member", member("officer"))).toEqual([]);
    expect(memberActions("leader", member("leader", true))).toEqual([]);
  });
});

describe("help and rally buttons", () => {
  const request = { id: "h", handle: "AB2345", kind: "upgrade", endsAt: 9, helps: 0, maxHelps: 5, mine: false, helped: false } as const;

  test("Help is off for your own request, one you helped and a full one", () => {
    expect(canHelp(request)).toBe(true);
    expect(canHelp({ ...request, mine: true })).toBe(false);
    expect(canHelp({ ...request, helped: true })).toBe(false);
    expect(canHelp({ ...request, helps: 5 })).toBe(false);
  });

  const rally: RallyView = {
    id: "r",
    leader: "AB2345",
    target: { npcId: "npc-2", kind: "outpost", level: 3, x: 40, y: 40 },
    gatherUntil: 1000,
    arriveAt: 2000,
    returnAt: 3000,
    participants: 2,
    maxParticipants: 10,
    joined: false,
  };

  test("a rally can be joined while it gathers, has room, and the player is not in it", () => {
    expect(canJoinRally(rally, 999)).toBe(true);
    expect(canJoinRally(rally, 1000)).toBe(false);
    expect(canJoinRally({ ...rally, joined: true }, 0)).toBe(false);
    expect(canJoinRally({ ...rally, participants: 10 }, 0)).toBe(false);
  });
});

describe("the map's alliance parts", () => {
  test("an HQ tile is told apart from camps, NPCs and land", () => {
    const snap = { ...SNAPSHOT, hqs: [{ x: 20, y: 20, tag: "LF", mine: true }] };
    const info = tileInfo(snap, 20, 20);
    expect(info.kind === "hq" && info.hq.tag).toBe("LF");
    expect(tileInfo(snap, 10, 12).kind).toBe("own");
  });

  test("only a plain ASCII tag may be drawn on the canvas", () => {
    expect(drawableTag("LF")).toBe("LF");
    expect(drawableTag("A1B2")).toBe("A1B2");
    for (const bad of ["", "L", "LONGER", "lf", "ل", "<b>", "A B", "LF‮", "L\u0000F"]) expect(drawableTag(bad), bad).toBeNull();
  });

  test("rallies at an NPC, soonest to leave first", () => {
    const at = (id: string, npcId: string, gatherUntil: number): RallyView => ({
      id,
      leader: "AB2345",
      target: { npcId, kind: "outpost", level: 3, x: 0, y: 0 },
      gatherUntil,
      arriveAt: gatherUntil + 1,
      returnAt: gatherUntil + 2,
      participants: 1,
      maxParticipants: 10,
      joined: false,
    });
    const snap = { ...SNAPSHOT, rallies: [at("b", "npc-2", 50), at("x", "npc-1", 10), at("a", "npc-2", 20)] };
    expect(ralliesAt(snap, "npc-2").map((r) => r.id)).toEqual(["a", "b"]);
    expect(ralliesAt(snap, "npc-9")).toEqual([]);
  });
});

describe("marchStage with rallies", () => {
  const march = (over: Partial<MarchState>): MarchState => ({
    id: "m",
    target: { npcId: "npc-2", level: 4, x: 1, y: 1 },
    from: { x: 0, y: 0 },
    troops: { infantry: 1, scouts: 0, heavy: 0, porters: 0 },
    departAt: 1000,
    arriveAt: 2000,
    returnAt: 3000,
    outcome: null,
    ...over,
  });

  test("a rally's column is gathering until departAt, then marches like any other", () => {
    expect(marchStage(march({ rallyId: "r1" }), 500)).toBe("gathering");
    expect(marchStage(march({ rallyId: "r1" }), 1000)).toBe("outbound");
    expect(marchStage(march({ rallyId: "r1" }), 2000)).toBe("fighting");
  });

  test("a solo march is never gathering", () => {
    expect(marchStage(march({}), 500)).toBe("outbound");
  });
});
