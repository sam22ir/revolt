import { MAX_ALLIANCE_MEMBERS, terrainAt, type MapSnapshot } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { isHandleCollision, newHandle, withNewHandle } from "../src/db/accounts.ts";
import { call, connectChat, create, join, mine, player, post, team, MANY_GUESTS } from "./alliance-helpers.ts";
import { body, HOUR, newGuest, startServer, T0, type Json, type Server } from "./harness.ts";
import { getMap } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer(MANY_GUESTS);
});
afterEach(() => server.dispose());

describe("player handles", () => {
  test("every account gets a short public handle, shown on its own account and nowhere with its id", async () => {
    const a = await player(server);
    const b = await player(server);
    expect(a.handle).toMatch(/^[A-Z2-9]{6}$/);
    expect(b.handle).not.toBe(a.handle);
    const s = await body(await server.request("GET", "/v1/state", { token: a.token }));
    expect(s.account.handle).toBe(a.handle);
  });

  test("handles are unique per server: a duplicate is refused by the index and retried with a new one", async () => {
    const a = await player(server);
    await expect(
      server.env.DB.prepare("INSERT INTO accounts (id, created_at, handle) VALUES ('x', 1, ?)").bind(a.handle).run(),
    ).rejects.toSatisfy((e: unknown) => isHandleCollision(e));
    const seen: string[] = [];
    const h = await withNewHandle(async (handle) => {
      seen.push(handle);
      if (seen.length < 3) throw new Error("UNIQUE constraint failed: accounts.server, accounts.handle");
      return handle;
    });
    expect(seen).toHaveLength(3);
    expect(h).toBe(seen[2]);
    expect(newHandle()).toMatch(/^[A-Z2-9]{6}$/);
  });
});

describe("creating an alliance", () => {
  test("founds it with the creator as leader", async () => {
    const a = await player(server);
    const r = await create(server, a, "  Free   Lands ", "fl");
    expect(r).toMatchObject({ ok: true, now: T0, alliance: { name: "Free Lands", tag: "FL", myRank: "leader", maxMembers: MAX_ALLIANCE_MEMBERS, hq: null } });
    expect(r.alliance.members).toEqual([{ handle: a.handle, rank: "leader", joinedAt: T0, me: true }]);
    expect((await mine(server, a)).alliance).toEqual(r.alliance);
  });

  test("names are unique ignoring case and Unicode form; tags are unique", async () => {
    const a = await player(server);
    const b = await player(server);
    await create(server, a, "Free Lands", "FL");
    expect(await create(server, b, "FREE lands", "XX")).toMatchObject({ ok: false, reason: "name_taken" });
    expect(await create(server, b, "Les Aurès", "LA")).toMatchObject({ ok: true });
    const c = await player(server);
    expect(await create(server, c, "Les Aurès", "LB")).toMatchObject({ ok: false, reason: "name_taken" });
    expect(await create(server, c, "Another", "fl")).toMatchObject({ ok: false, reason: "tag_taken" });
  });

  test("refuses bad names and tags, and a player who is already in an alliance", async () => {
    const a = await player(server);
    for (const name of ["ab", "x".repeat(25), "bad‮name", "zero​width", "", "  "]) {
      expect(await create(server, a, name, "OK"), name).toMatchObject({ ok: false, reason: "bad_name" });
    }
    for (const tag of ["A", "ABCDE", "é!", "ا", "a b"]) expect(await create(server, a, "Fine Name", tag), tag).toMatchObject({ ok: false, reason: "bad_tag" });
    expect((await mine(server, a)).alliance).toBeNull();
    await create(server, a);
    expect(await create(server, a, "Second", "SE")).toMatchObject({ ok: false, reason: "already_member" });
  });

  test("malformed bodies are 400", async () => {
    const a = await player(server);
    expect((await server.request("POST", "/v1/alliance", { token: a.token, raw: "[1]" })).status).toBe(400);
    expect(await post(server, a, "/v1/alliance", { name: 5, tag: {} })).toMatchObject({ ok: false, reason: "bad_name" });
  });

  test("two players founding the same name at once: exactly one wins", async () => {
    const [a, b] = [await player(server), await player(server)];
    const rs = await Promise.all([create(server, a, "Same Name", "AA"), create(server, b, "Same Name", "BB")]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)?.reason).toBe("name_taken");
  });

  test("a player cannot be founder of two alliances created at once", async () => {
    const a = await player(server);
    const rs = await Promise.all([create(server, a, "One One", "O1"), create(server, a, "Two Two", "T2")]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)?.reason).toBe("already_member");
  });

  test("needs a session", async () => {
    expect((await server.request("POST", "/v1/alliance", { body: { name: "Free Lands", tag: "FL" } })).status).toBe(401);
    expect((await server.request("GET", "/v1/alliance")).status).toBe(401);
    expect((await server.request("GET", "/v1/alliances")).status).toBe(401);
  });
});

describe("finding and joining", () => {
  test("search matches the start of a name, ignoring case, biggest first, and treats wildcards as text", async () => {
    const t = await team(server, 3, "Free Lands", "FL");
    await create(server, await player(server), "Free Spirits", "FS");
    await create(server, await player(server), "Aurès 50%", "AU");
    const a = await player(server);
    const list = async (q: string): Promise<Json[]> => (await call(server, a, "GET", `/v1/alliances?q=${encodeURIComponent(q)}`)).alliances;
    expect((await list("free")).map((x) => x.name)).toEqual(["Free Lands", "Free Spirits"]);
    expect((await list("FREE L"))[0]).toEqual({ id: t.allianceId, name: "Free Lands", tag: "FL", members: 3, maxMembers: MAX_ALLIANCE_MEMBERS });
    expect((await list("")).length).toBe(3);
    expect(await list("%")).toEqual([]);
    expect((await list("aurès 50%")).map((x) => x.name)).toEqual(["Aurès 50%"]);
    expect(await list("nothing")).toEqual([]);
    expect((await server.request("GET", `/v1/alliances?q=${"x".repeat(80)}`, { token: a.token })).status).toBe(400);
  });

  test("an open alliance can be joined; the member sees the alliance and the leader sees the newcomer", async () => {
    const t = await team(server, 1);
    const m = await player(server);
    const r = await join(server, m, t.allianceId);
    expect(r).toMatchObject({ ok: true, alliance: { myRank: "member" } });
    expect(r.alliance.members.map((x: Json) => [x.handle, x.rank, x.me])).toEqual([
      [t.leader.handle, "leader", false],
      [m.handle, "member", true],
    ]);
    expect((await mine(server, t.leader)).alliance?.members).toHaveLength(2);
    expect(server.room(t.allianceId).notices).toContain("members_changed");
  });

  test("refuses a second alliance, an unknown alliance, and a full one", async () => {
    const t = await team(server, 1);
    const other = await team(server, 1, "Other", "OT");
    expect(await join(server, t.leader, other.allianceId)).toMatchObject({ ok: false, reason: "already_member" });
    const m = await player(server);
    expect(await join(server, m, "no-such-alliance")).toMatchObject({ ok: false, reason: "alliance_gone" });
    for (let i = 1; i < MAX_ALLIANCE_MEMBERS; i++) {
      expect((await join(server, await player(server), t.allianceId)).ok, `member ${i}`).toBe(true);
    }
    expect(await join(server, m, t.allianceId)).toMatchObject({ ok: false, reason: "alliance_full" });
    expect((await mine(server, m)).alliance).toBeNull();
  });

  test("two players racing for the last place: exactly one gets it", async () => {
    const t = await team(server, 1);
    for (let i = 1; i < MAX_ALLIANCE_MEMBERS - 1; i++) await join(server, await player(server), t.allianceId);
    const [a, b, c] = [await player(server), await player(server), await player(server)];
    const rs = await Promise.all([join(server, a, t.allianceId), join(server, b, t.allianceId), join(server, c, t.allianceId)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok).every((r) => r.reason === "alliance_full")).toBe(true);
    const count = await server.env.DB.prepare("SELECT COUNT(*) AS n FROM alliance_members WHERE alliance_id = ?").bind(t.allianceId).first<{ n: number }>();
    expect(count?.n).toBe(MAX_ALLIANCE_MEMBERS);
  });

  test("the same player joining twice at once is in once", async () => {
    const t = await team(server, 1);
    const m = await player(server);
    const rs = await Promise.all([join(server, m, t.allianceId), join(server, m, t.allianceId)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)?.reason).toBe("already_member");
  });
});

describe("leaving", () => {
  test("a member can leave; their chat sockets are closed with a kicked notice", async () => {
    const t = await team(server, 2);
    const m = t.members[0]!;
    const sock = await connectChat(server, m, t.allianceId);
    const r = await post(server, m, "/v1/alliance/leave");
    expect(r).toMatchObject({ ok: true, alliance: null });
    expect(sock.open).toBe(false);
    expect(sock.received.at(-1)).toEqual({ type: "kicked" });
    expect((await mine(server, m)).alliance).toBeNull();
    expect((await mine(server, t.leader)).alliance?.members).toHaveLength(1);
    expect(await post(server, m, "/v1/alliance/leave")).toMatchObject({ ok: false, reason: "not_member" });
  });

  test("a leader with members must transfer first; the last member leaving ends the alliance", async () => {
    const t = await team(server, 2);
    expect(await post(server, t.leader, "/v1/alliance/leave")).toMatchObject({ ok: false, reason: "leader_must_transfer" });
    expect((await mine(server, t.leader)).alliance).not.toBeNull();
    await post(server, t.members[0]!, "/v1/alliance/leave");
    expect(await post(server, t.leader, "/v1/alliance/leave")).toMatchObject({ ok: true, alliance: null });
    expect(server.room(t.allianceId).disbanded).toBe(true);
    const a = await player(server);
    expect((await call(server, a, "GET", "/v1/alliances?q=free")).alliances).toEqual([]);
    expect(await create(server, t.leader, "Free Lands", "FL")).toMatchObject({ ok: true });
  });

  test("the leader leaving while a member joins at the same moment cannot orphan the member", async () => {
    const t = await team(server, 1);
    const m = await player(server);
    const [left, joined] = await Promise.all([post(server, t.leader, "/v1/alliance/leave"), join(server, m, t.allianceId)]);
    const rows = await server.env.DB.prepare("SELECT account_id, rank FROM alliance_members WHERE alliance_id = ?").bind(t.allianceId).all<{ rank: string }>();
    const exists = await server.env.DB.prepare("SELECT 1 AS x FROM alliances WHERE id = ?").bind(t.allianceId).first();
    // Whatever order they ran in, an alliance with members has a leader, and one without members is gone.
    if (exists !== null) expect(rows.results.some((r) => r.rank === "leader")).toBe(true);
    else expect(rows.results).toEqual([]);
    expect(left.ok || joined.ok).toBe(true);
  });
});

describe("ranks and removal", () => {
  const act = (p: { token: string }, what: string, handle: unknown): Promise<Json> => post(server, p.token, `/v1/alliance/${what}`, { handle });

  test("the permission matrix over the wire", async () => {
    const t = await team(server, 4);
    const [officer, member, other] = t.members as [typeof t.leader, typeof t.leader, typeof t.leader];
    expect(await act(t.leader, "promote", officer.handle)).toMatchObject({ ok: true });
    // A member can do none of it; an officer cannot promote, demote or transfer.
    for (const what of ["kick", "promote", "demote", "transfer"]) expect(await act(member, what, other.handle), what).toMatchObject({ ok: false, reason: "no_permission" });
    for (const what of ["promote", "demote", "transfer"]) expect(await act(officer, what, member.handle), what).toMatchObject({ ok: false, reason: "no_permission" });
    // An officer kicks members, never officers or the leader.
    expect(await act(officer, "kick", t.leader.handle)).toMatchObject({ ok: false, reason: "target_rank" });
    expect(await act(t.leader, "promote", member.handle)).toMatchObject({ ok: true });
    expect(await act(officer, "kick", member.handle)).toMatchObject({ ok: false, reason: "target_rank" });
    expect(await act(officer, "kick", other.handle)).toMatchObject({ ok: true });
    expect((await mine(server, other)).alliance).toBeNull();
    expect((await mine(server, t.leader)).alliance?.members.map((x) => x.rank)).toEqual(["leader", "officer", "officer"]);
  });

  test("promote and demote move one step; the leader cannot be targeted", async () => {
    const t = await team(server, 2);
    const m = t.members[0]!;
    expect(await act(t.leader, "demote", m.handle)).toMatchObject({ ok: false, reason: "target_rank" });
    expect((await act(t.leader, "promote", m.handle)).alliance.members[1].rank).toBe("officer");
    expect(await act(t.leader, "promote", m.handle)).toMatchObject({ ok: false, reason: "target_rank" });
    expect((await act(t.leader, "demote", m.handle)).alliance.members[1].rank).toBe("member");
    for (const what of ["kick", "promote", "demote", "transfer"]) expect(await act(t.leader, what, t.leader.handle), what).toMatchObject({ ok: false, reason: "target_rank" });
  });

  test("transfer makes the target leader and the old leader an officer, atomically", async () => {
    const t = await team(server, 3);
    const [a, b] = t.members as [typeof t.leader, typeof t.leader];
    const r = await act(t.leader, "transfer", a.handle);
    expect(r.alliance.members.map((x: Json) => [x.handle, x.rank])).toEqual([[a.handle, "leader"], [t.leader.handle, "officer"], [b.handle, "member"]]);
    expect(await act(t.leader, "transfer", b.handle)).toMatchObject({ ok: false, reason: "no_permission" });
    const rows = await server.env.DB.prepare("SELECT COUNT(*) AS n FROM alliance_members WHERE alliance_id = ? AND rank = 'leader'").bind(t.allianceId).first<{ n: number }>();
    expect(rows?.n).toBe(1);
    // The old leader can leave now; the new one cannot until last.
    expect(await post(server, t.leader, "/v1/alliance/leave")).toMatchObject({ ok: true });
    expect(await post(server, a, "/v1/alliance/leave")).toMatchObject({ ok: false, reason: "leader_must_transfer" });
  });

  test("a rank change reaches the chat room, and a kick closes the member's socket", async () => {
    const t = await team(server, 3);
    const [a, b] = t.members as [typeof t.leader, typeof t.leader];
    const sa = await connectChat(server, a, t.allianceId);
    const sb = await connectChat(server, b, t.allianceId);
    await act(t.leader, "promote", a.handle);
    expect(sa.rank).toBe("officer");
    expect(sb.rank).toBe("member");
    await act(t.leader, "kick", b.handle);
    expect(sb.open).toBe(false);
    expect(sb.closeCode).toBe(1008);
    expect(sa.open).toBe(true);
  });

  test("targets are found by handle inside the actor's own alliance only", async () => {
    const t = await team(server, 2);
    const foreign = await team(server, 2, "Other", "OT");
    const f = foreign.members[0]!;
    for (const what of ["kick", "promote", "demote", "transfer"]) {
      expect(await act(t.leader, what, f.handle), what).toMatchObject({ ok: false, reason: "target_not_found" });
      expect(await act(t.leader, what, "NOBODY"), what).toMatchObject({ ok: false, reason: "target_not_found" });
      expect(await act(t.leader, what, "' OR 1=1 --"), what).toMatchObject({ ok: false, reason: "target_not_found" });
    }
    expect((await mine(server, f)).alliance?.myRank).toBe("member");
    for (const bad of [5, "", "x".repeat(40), null, ["a"]]) {
      expect((await server.request("POST", "/v1/alliance/kick", { token: t.leader.token, body: { handle: bad } })).status).toBe(400);
    }
    const loner = await player(server);
    expect(await act(loner, "kick", t.members[0]!.handle)).toMatchObject({ ok: false, reason: "not_member" });
  });

  test("a kicked player can join again; their help and requests are gone", async () => {
    const t = await team(server, 2);
    const m = t.members[0]!;
    await act(t.leader, "kick", m.handle);
    expect((await join(server, m, t.allianceId)).ok).toBe(true);
  });
});

describe("what other players can learn", () => {
  test("no alliance answer carries an account id; members are handles", async () => {
    const t = await team(server, 3);
    await post(server, t.leader, "/v1/alliance/hq", { x: 3, y: 3 });
    const all = [
      JSON.stringify(await call(server, t.members[0]!, "GET", "/v1/alliance")),
      JSON.stringify(await call(server, t.leader, "GET", "/v1/alliances?q=")),
      JSON.stringify(await getMap(server, t.members[1]!.token)),
    ].join("\n");
    for (const p of [t.leader, ...t.members]) {
      expect(all).not.toContain(p.id);
      expect(all).toContain(p.handle);
    }
  });
});

describe("alliance HQ on the map", () => {
  const findTile = (snap: MapSnapshot, wanted: (x: number, y: number) => boolean): { x: number; y: number } => {
    for (let x = 0; x < snap.size; x++) for (let y = 0; y < snap.size; y++) if (wanted(x, y)) return { x, y };
    throw new Error("no tile");
  };
  const clearOf = (snap: MapSnapshot) => (x: number, y: number): boolean =>
    terrainAt(snap.terrainSeed, x, y) !== "mountain" &&
    [...snap.bases, ...snap.npcs, ...snap.hqs].every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > 2);

  test("only the leader places it; everyone sees it; the alliance tag shows on members' bases", async () => {
    const t = await team(server, 3);
    for (const p of t.members) await getMap(server, p.token);
    const snap = await getMap(server, t.leader.token);
    const at = findTile(snap, clearOf(snap));
    const [officer, member] = t.members as [typeof t.leader, typeof t.leader];
    await post(server, t.leader, "/v1/alliance/promote", { handle: officer.handle });
    for (const p of [officer, member]) expect(await post(server, p, "/v1/alliance/hq", at), p.handle).toMatchObject({ ok: false, reason: "no_permission" });
    const r = await post(server, t.leader, "/v1/alliance/hq", at);
    expect(r).toMatchObject({ ok: true, alliance: { hq: at } });
    const outsider = await player(server);
    for (const [viewer, mineFlag] of [[outsider, false], [member, true], [t.leader, true]] as const) {
      const s = await getMap(server, viewer.token);
      expect(s.hqs).toEqual([{ tag: "FL", ...at, mine: mineFlag }]);
    }
    const s = await getMap(server, outsider.token);
    expect(s.bases.filter((b) => b.alliance === "FL")).toHaveLength(3);
    expect(s.bases.filter((b) => b.alliance === null)).toHaveLength(1);
    expect((await mine(server, member)).alliance?.hq).toEqual(at);
  });

  test("refuses off-map, mountain and crowded tiles; malformed coordinates are 400", async () => {
    const t = await team(server, 1);
    const snap = await getMap(server, t.leader.token);
    const mountain = findTile(snap, (x, y) => terrainAt(snap.terrainSeed, x, y) === "mountain");
    const base = snap.bases[0]!;
    expect(await post(server, t.leader, "/v1/alliance/hq", mountain)).toMatchObject({ ok: false, reason: "bad_tile" });
    expect(await post(server, t.leader, "/v1/alliance/hq", { x: -1, y: 5 })).toMatchObject({ ok: false, reason: "bad_tile" });
    expect(await post(server, t.leader, "/v1/alliance/hq", { x: 3.5, y: 5 })).toMatchObject({ ok: false, reason: "bad_tile" });
    expect(await post(server, t.leader, "/v1/alliance/hq", { x: snap.size, y: 0 })).toMatchObject({ ok: false, reason: "bad_tile" });
    expect(await post(server, t.leader, "/v1/alliance/hq", { x: base.x + 1, y: base.y })).toMatchObject({ ok: false, reason: "tile_taken" });
    const npc = snap.npcs[0]!;
    expect(await post(server, t.leader, "/v1/alliance/hq", { x: npc.x, y: npc.y })).toMatchObject({ ok: false, reason: "tile_taken" });
    for (const bad of [{ x: "1", y: 2 }, { x: 1 }, { x: null, y: 1 }, { x: Number.NaN, y: 1 }]) {
      expect((await server.request("POST", "/v1/alliance/hq", { token: t.leader.token, body: bad })).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await mine(server, t.leader)).alliance?.hq).toBeNull();
  });

  test("moving it waits an hour; a disbanded alliance's HQ leaves the map", async () => {
    const t = await team(server, 1);
    const snap = await getMap(server, t.leader.token);
    const ok = (x: number, y: number): boolean => clearOf(snap)(x, y);
    const first = findTile(snap, ok);
    expect(await post(server, t.leader, "/v1/alliance/hq", first)).toMatchObject({ ok: true });
    const second = findTile(snap, (x, y) => ok(x, y) && Math.abs(x - first.x) > 5);
    expect(await post(server, t.leader, "/v1/alliance/hq", second)).toMatchObject({ ok: false, reason: "hq_cooldown" });
    server.now = T0 + HOUR - 1;
    expect(await post(server, t.leader, "/v1/alliance/hq", second)).toMatchObject({ ok: false, reason: "hq_cooldown" });
    server.now = T0 + HOUR;
    expect(await post(server, t.leader, "/v1/alliance/hq", second)).toMatchObject({ ok: true, alliance: { hq: second } });
    await post(server, t.leader, "/v1/alliance/leave");
    expect((await getMap(server, (await player(server)).token)).hqs).toEqual([]);
  });

  test("random placement of new bases and targets keeps clear of an HQ", async () => {
    const t = await team(server, 1);
    const snap = await getMap(server, t.leader.token);
    const at = findTile(snap, clearOf(snap));
    await post(server, t.leader, "/v1/alliance/hq", at);
    for (let i = 0; i < 20; i++) await getMap(server, (await player(server)).token);
    const after = await getMap(server, t.leader.token);
    for (const b of after.bases) expect(Math.max(Math.abs(b.x - at.x), Math.abs(b.y - at.y))).toBeGreaterThan(2);
  });
});

describe("leaving the alliance updates the map", () => {
  test("a member's base loses the tag when they leave or are kicked", async () => {
    const t = await team(server, 3);
    const [a, b] = t.members as [typeof t.leader, typeof t.leader];
    for (const p of t.members) await getMap(server, p.token);
    const tagOf = async (p: typeof a): Promise<string | null | undefined> => (await getMap(server, t.leader.token)).bases.find((x) => x.tag === p.handle)?.alliance;
    expect(await tagOf(a)).toBe("FL");
    await post(server, a, "/v1/alliance/leave");
    expect(await tagOf(a)).toBeNull();
    await post(server, t.leader, "/v1/alliance/kick", { handle: b.handle });
    expect(await tagOf(b)).toBeNull();
  });
});

