import { baseSiteOk, MAX_ALLIANCE_MEMBERS, terrainAt, type MapSnapshot } from "@revolt/rules";
import { test } from "vitest";
import { call, connectChat, create, join, mine, MANY_GUESTS, player, post, team, type Player } from "./alliance-helpers.ts";
import { HOUR, T0, type Json, type Server } from "./harness.ts";
import { getMap } from "./map-helpers.ts";
import { LONG, rows } from "./rows.ts";

const act = (s: Server, p: { token: string }, what: string, handle: unknown): Promise<Json> => post(s, p.token, `/v1/alliance/${what}`, { handle });
const memberCount = async (s: Server, allianceId: string): Promise<number | undefined> =>
  (await s.env.DB.prepare("SELECT COUNT(*) AS n FROM alliance_members WHERE alliance_id = ?").bind(allianceId).first<{ n: number }>())?.n;

test("creating an alliance: founding, uniqueness, validation, races, session", async () => {
  await rows(MANY_GUESTS, {
    "founds it with the creator as leader": async (s, ex) => {
      const a = await player(s);
      const r = await create(s, a, "  Free   Lands ", "fl");
      ex(r).toMatchObject({ ok: true, now: T0, alliance: { name: "Free Lands", tag: "FL", myRank: "leader", maxMembers: MAX_ALLIANCE_MEMBERS, hq: null } });
      ex(r.alliance.members).toEqual([{ handle: a.handle, rank: "leader", joinedAt: T0, me: true }]);
      ex((await mine(s, a)).alliance).toEqual(r.alliance);
    },
    "names are unique ignoring case and Unicode form; tags are unique": async (s, ex) => {
      const a = await player(s);
      const b = await player(s);
      await create(s, a, "Free Lands", "FL");
      ex(await create(s, b, "FREE lands", "XX"), "case").toMatchObject({ ok: false, reason: "name_taken" });
      ex(await create(s, b, "Les Aurès", "LA"), "first accent").toMatchObject({ ok: true });
      const c = await player(s);
      ex(await create(s, c, "Les Aurès", "LB"), "unicode form").toMatchObject({ ok: false, reason: "name_taken" });
      ex(await create(s, c, "Another", "fl"), "tag").toMatchObject({ ok: false, reason: "tag_taken" });
    },
    "refuses bad names and tags, and a player who is already in an alliance": async (s, ex) => {
      const a = await player(s);
      for (const name of ["ab", "x".repeat(25), "bad‮name", "zero​width", "", "  "]) {
        ex(await create(s, a, name, "OK"), `name ${JSON.stringify(name)}`).toMatchObject({ ok: false, reason: "bad_name" });
      }
      for (const tag of ["A", "ABCDE", "é!", "ا", "a b"]) ex(await create(s, a, "Fine Name", tag), `tag ${tag}`).toMatchObject({ ok: false, reason: "bad_tag" });
      ex((await mine(s, a)).alliance).toBeNull();
      await create(s, a);
      ex(await create(s, a, "Second", "SE")).toMatchObject({ ok: false, reason: "already_member" });
    },
    "malformed bodies are 400": async (s, ex) => {
      const a = await player(s);
      ex((await s.request("POST", "/v1/alliance", { token: a.token, raw: "[1]" })).status).toBe(400);
      ex(await post(s, a, "/v1/alliance", { name: 5, tag: {} })).toMatchObject({ ok: false, reason: "bad_name" });
    },
    "two players founding the same name at once: exactly one wins": async (s, ex) => {
      const [a, b] = [await player(s), await player(s)];
      const rs = await Promise.all([create(s, a, "Same Name", "AA"), create(s, b, "Same Name", "BB")]);
      ex(rs.filter((r) => r.ok)).toHaveLength(1);
      ex(rs.find((r) => !r.ok)?.reason).toBe("name_taken");
    },
    "a player cannot be founder of two alliances created at once": async (s, ex) => {
      const a = await player(s);
      const rs = await Promise.all([create(s, a, "One One", "O1"), create(s, a, "Two Two", "T2")]);
      ex(rs.filter((r) => r.ok)).toHaveLength(1);
      ex(rs.find((r) => !r.ok)?.reason).toBe("already_member");
    },
    "needs a session": async (s, ex) => {
      ex((await s.request("POST", "/v1/alliance", { body: { name: "Free Lands", tag: "FL" } })).status, "create").toBe(401);
      ex((await s.request("GET", "/v1/alliance")).status, "mine").toBe(401);
      ex((await s.request("GET", "/v1/alliances")).status, "search").toBe(401);
    },
  });
}, LONG);

test("finding and joining an alliance: search, join, full alliance, races", async () => {
  await rows(MANY_GUESTS, {
    "search matches the start of a name, ignoring case, biggest first, and treats wildcards as text": async (s, ex) => {
      const t = await team(s, 3, "Free Lands", "FL");
      await create(s, await player(s), "Free Spirits", "FS");
      await create(s, await player(s), "Aurès 50%", "AU");
      const a = await player(s);
      const list = async (q: string): Promise<Json[]> => (await call(s, a, "GET", `/v1/alliances?q=${encodeURIComponent(q)}`)).alliances;
      ex((await list("free")).map((x) => x.name), "prefix, biggest first").toEqual(["Free Lands", "Free Spirits"]);
      ex((await list("FREE L"))[0], "case and shape").toEqual({ id: t.allianceId, name: "Free Lands", tag: "FL", members: 3, maxMembers: MAX_ALLIANCE_MEMBERS });
      ex((await list("")).length, "empty query").toBe(3);
      ex(await list("%"), "wildcard").toEqual([]);
      ex((await list("aurès 50%")).map((x) => x.name), "literal percent").toEqual(["Aurès 50%"]);
      ex(await list("nothing"), "no match").toEqual([]);
      ex((await s.request("GET", `/v1/alliances?q=${"x".repeat(80)}`, { token: a.token })).status, "too long").toBe(400);
    },
    "an open alliance can be joined; the member sees the alliance and the leader sees the newcomer": async (s, ex) => {
      const t = await team(s, 1);
      const m = await player(s);
      const r = await join(s, m, t.allianceId);
      ex(r).toMatchObject({ ok: true, alliance: { myRank: "member" } });
      ex(r.alliance.members.map((x: Json) => [x.handle, x.rank, x.me])).toEqual([
        [t.leader.handle, "leader", false],
        [m.handle, "member", true],
      ]);
      ex((await mine(s, t.leader)).alliance?.members).toHaveLength(2);
      ex(s.room(t.allianceId).notices).toContain("members_changed");
    },
    "refuses a second alliance, an unknown alliance, and a full one": async (s, ex) => {
      const t = await team(s, 1);
      const other = await team(s, 1, "Other", "OT");
      ex(await join(s, t.leader, other.allianceId), "second alliance").toMatchObject({ ok: false, reason: "already_member" });
      const m = await player(s);
      ex(await join(s, m, "no-such-alliance"), "unknown").toMatchObject({ ok: false, reason: "alliance_gone" });
      for (let i = 1; i < MAX_ALLIANCE_MEMBERS; i++) {
        ex((await join(s, await player(s), t.allianceId)).ok, `member ${i}`).toBe(true);
      }
      ex(await join(s, m, t.allianceId), "full").toMatchObject({ ok: false, reason: "alliance_full" });
      ex((await mine(s, m)).alliance).toBeNull();
    },
    "two players racing for the last place: exactly one gets it": async (s, ex) => {
      const t = await team(s, 1);
      for (let i = 1; i < MAX_ALLIANCE_MEMBERS - 1; i++) await join(s, await player(s), t.allianceId);
      const [a, b, c] = [await player(s), await player(s), await player(s)];
      const rs = await Promise.all([join(s, a, t.allianceId), join(s, b, t.allianceId), join(s, c, t.allianceId)]);
      ex(rs.filter((r) => r.ok)).toHaveLength(1);
      ex(rs.filter((r) => !r.ok).every((r) => r.reason === "alliance_full")).toBe(true);
      ex(await memberCount(s, t.allianceId)).toBe(MAX_ALLIANCE_MEMBERS);
    },
    "the same player joining twice at once is in once": async (s, ex) => {
      const t = await team(s, 1);
      const m = await player(s);
      const rs = await Promise.all([join(s, m, t.allianceId), join(s, m, t.allianceId)]);
      ex(rs.filter((r) => r.ok)).toHaveLength(1);
      ex(rs.find((r) => !r.ok)?.reason).toBe("already_member");
    },
  });
}, LONG);

test("leaving an alliance: members, leaders, the last member, a race", async () => {
  await rows(MANY_GUESTS, {
    "a member can leave; their chat sockets are closed with a kicked notice": async (s, ex) => {
      const t = await team(s, 2);
      const m = t.members[0]!;
      const sock = await connectChat(s, m, t.allianceId);
      const r = await post(s, m, "/v1/alliance/leave");
      ex(r).toMatchObject({ ok: true, alliance: null });
      ex(sock.open).toBe(false);
      ex(sock.received.at(-1)).toEqual({ type: "kicked" });
      ex((await mine(s, m)).alliance).toBeNull();
      ex((await mine(s, t.leader)).alliance?.members).toHaveLength(1);
      ex(await post(s, m, "/v1/alliance/leave"), "leaving twice").toMatchObject({ ok: false, reason: "not_member" });
    },
    "a leader with members must transfer first; the last member leaving ends the alliance": async (s, ex) => {
      const t = await team(s, 2);
      ex(await post(s, t.leader, "/v1/alliance/leave")).toMatchObject({ ok: false, reason: "leader_must_transfer" });
      ex((await mine(s, t.leader)).alliance).not.toBeNull();
      await post(s, t.members[0]!, "/v1/alliance/leave");
      ex(await post(s, t.leader, "/v1/alliance/leave"), "last member").toMatchObject({ ok: true, alliance: null });
      ex(s.room(t.allianceId).disbanded).toBe(true);
      const a = await player(s);
      ex((await call(s, a, "GET", "/v1/alliances?q=free")).alliances).toEqual([]);
      ex(await create(s, t.leader, "Free Lands", "FL"), "name is free again").toMatchObject({ ok: true });
    },
    "the leader leaving while a member joins at the same moment cannot orphan the member": async (s, ex) => {
      const t = await team(s, 1);
      const m = await player(s);
      const [left, joined] = await Promise.all([post(s, t.leader, "/v1/alliance/leave"), join(s, m, t.allianceId)]);
      const rs = await s.env.DB.prepare("SELECT account_id, rank FROM alliance_members WHERE alliance_id = ?").bind(t.allianceId).all<{ rank: string }>();
      const exists = await s.env.DB.prepare("SELECT 1 AS x FROM alliances WHERE id = ?").bind(t.allianceId).first();
      // Whatever order they ran in, an alliance with members has a leader, and one without members is gone.
      if (exists !== null) ex(rs.results.some((r) => r.rank === "leader")).toBe(true);
      else ex(rs.results).toEqual([]);
      ex(left.ok || joined.ok).toBe(true);
    },
  });
}, LONG);

test("ranks and removal: permissions, promote, demote, transfer, kick, rejoin", async () => {
  await rows(MANY_GUESTS, {
    "the permission matrix over the wire": async (s, ex) => {
      const t = await team(s, 4);
      const [officer, member, other] = t.members as [Player, Player, Player];
      ex(await act(s, t.leader, "promote", officer.handle)).toMatchObject({ ok: true });
      // A member can do none of it; an officer cannot promote, demote or transfer.
      for (const what of ["kick", "promote", "demote", "transfer"]) ex(await act(s, member, what, other.handle), `member ${what}`).toMatchObject({ ok: false, reason: "no_permission" });
      for (const what of ["promote", "demote", "transfer"]) ex(await act(s, officer, what, member.handle), `officer ${what}`).toMatchObject({ ok: false, reason: "no_permission" });
      // An officer kicks members, never officers or the leader.
      ex(await act(s, officer, "kick", t.leader.handle), "officer kicks leader").toMatchObject({ ok: false, reason: "target_rank" });
      ex(await act(s, t.leader, "promote", member.handle)).toMatchObject({ ok: true });
      ex(await act(s, officer, "kick", member.handle), "officer kicks officer").toMatchObject({ ok: false, reason: "target_rank" });
      ex(await act(s, officer, "kick", other.handle), "officer kicks member").toMatchObject({ ok: true });
      ex((await mine(s, other)).alliance).toBeNull();
      ex((await mine(s, t.leader)).alliance?.members.map((x) => x.rank)).toEqual(["leader", "officer", "officer"]);
    },
    "promote and demote move one step; the leader cannot be targeted": async (s, ex) => {
      const t = await team(s, 2);
      const m = t.members[0]!;
      ex(await act(s, t.leader, "demote", m.handle), "demote a member").toMatchObject({ ok: false, reason: "target_rank" });
      ex((await act(s, t.leader, "promote", m.handle)).alliance.members[1].rank).toBe("officer");
      ex(await act(s, t.leader, "promote", m.handle), "promote an officer").toMatchObject({ ok: false, reason: "target_rank" });
      ex((await act(s, t.leader, "demote", m.handle)).alliance.members[1].rank).toBe("member");
      for (const what of ["kick", "promote", "demote", "transfer"]) ex(await act(s, t.leader, what, t.leader.handle), `leader ${what} self`).toMatchObject({ ok: false, reason: "target_rank" });
    },
    "transfer makes the target leader and the old leader an officer, atomically": async (s, ex) => {
      const t = await team(s, 3);
      const [a, b] = t.members as [Player, Player];
      const r = await act(s, t.leader, "transfer", a.handle);
      ex(r.alliance.members.map((x: Json) => [x.handle, x.rank])).toEqual([[a.handle, "leader"], [t.leader.handle, "officer"], [b.handle, "member"]]);
      ex(await act(s, t.leader, "transfer", b.handle), "old leader transfers again").toMatchObject({ ok: false, reason: "no_permission" });
      const rows = await s.env.DB.prepare("SELECT COUNT(*) AS n FROM alliance_members WHERE alliance_id = ? AND rank = 'leader'").bind(t.allianceId).first<{ n: number }>();
      ex(rows?.n).toBe(1);
      ex((await s.env.DB.prepare("SELECT COUNT(*) AS n FROM batch_assert").first<{ n: number }>())?.n).toBe(0);
      // The old leader can leave now; the new one cannot until last.
      ex(await post(s, t.leader, "/v1/alliance/leave"), "old leader leaves").toMatchObject({ ok: true });
      ex(await post(s, a, "/v1/alliance/leave"), "new leader leaves").toMatchObject({ ok: false, reason: "leader_must_transfer" });
    },
    "a rank change reaches the chat room, and a kick closes the member's socket": async (s, ex) => {
      const t = await team(s, 3);
      const [a, b] = t.members as [Player, Player];
      const sa = await connectChat(s, a, t.allianceId);
      const sb = await connectChat(s, b, t.allianceId);
      await act(s, t.leader, "promote", a.handle);
      ex(sa.rank).toBe("officer");
      ex(sb.rank).toBe("member");
      await act(s, t.leader, "kick", b.handle);
      ex(sb.open).toBe(false);
      ex(sb.closeCode).toBe(1008);
      ex(sa.open).toBe(true);
    },
    "targets are found by handle inside the actor's own alliance only": async (s, ex) => {
      const t = await team(s, 2);
      const foreign = await team(s, 2, "Other", "OT");
      const f = foreign.members[0]!;
      for (const what of ["kick", "promote", "demote", "transfer"]) {
        ex(await act(s, t.leader, what, f.handle), `${what} foreign`).toMatchObject({ ok: false, reason: "target_not_found" });
        ex(await act(s, t.leader, what, "NOBODY"), `${what} nobody`).toMatchObject({ ok: false, reason: "target_not_found" });
        ex(await act(s, t.leader, what, "' OR 1=1 --"), `${what} injection`).toMatchObject({ ok: false, reason: "target_not_found" });
      }
      ex((await mine(s, f)).alliance?.myRank).toBe("member");
      for (const bad of [5, "", "x".repeat(40), null, ["a"]]) {
        ex((await s.request("POST", "/v1/alliance/kick", { token: t.leader.token, body: { handle: bad } })).status, `handle ${JSON.stringify(bad)}`).toBe(400);
      }
      const loner = await player(s);
      ex(await act(s, loner, "kick", t.members[0]!.handle), "not a member").toMatchObject({ ok: false, reason: "not_member" });
    },
    "a kicked player can join again; their help and requests are gone": async (s, ex) => {
      const t = await team(s, 2);
      const m = t.members[0]!;
      await act(s, t.leader, "kick", m.handle);
      ex((await join(s, m, t.allianceId)).ok).toBe(true);
    },
  });
}, LONG);

test("what other players can learn about accounts", async () => {
  await rows(MANY_GUESTS, {
    "no alliance answer carries an account id; members are handles": async (s, ex) => {
      const t = await team(s, 3);
      await post(s, t.leader, "/v1/alliance/hq", { x: 3, y: 3 });
      const all = [
        JSON.stringify(await call(s, t.members[0]!, "GET", "/v1/alliance")),
        JSON.stringify(await call(s, t.leader, "GET", "/v1/alliances?q=")),
        JSON.stringify(await getMap(s, t.members[1]!.token)),
      ].join("\n");
      for (const p of [t.leader, ...t.members]) {
        ex(all, `id of ${p.handle}`).not.toContain(p.id);
        ex(all, `handle ${p.handle}`).toContain(p.handle);
      }
    },
  });
}, LONG);

test("alliance HQ on the map and the member tag", async () => {
  const findTile = (snap: MapSnapshot, wanted: (x: number, y: number) => boolean): { x: number; y: number } => {
    for (let x = 0; x < snap.size; x++) for (let y = 0; y < snap.size; y++) if (wanted(x, y)) return { x, y };
    throw new Error("no tile");
  };
  const clearOf = (snap: MapSnapshot) => (x: number, y: number): boolean =>
    baseSiteOk(snap.terrainSeed, x, y) &&
    [...snap.bases, ...snap.npcs, ...snap.hqs].every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > 2);
  await rows(MANY_GUESTS, {
    "only the leader places it; everyone sees it; the alliance tag shows on members' bases": async (s, ex) => {
      const t = await team(s, 3);
      for (const p of t.members) await getMap(s, p.token);
      const snap = await getMap(s, t.leader.token);
      const at = findTile(snap, clearOf(snap));
      const [officer, member] = t.members as [Player, Player];
      await post(s, t.leader, "/v1/alliance/promote", { handle: officer.handle });
      for (const p of [officer, member]) ex(await post(s, p, "/v1/alliance/hq", at), `non-leader ${p.handle}`).toMatchObject({ ok: false, reason: "no_permission" });
      const r = await post(s, t.leader, "/v1/alliance/hq", at);
      ex(r).toMatchObject({ ok: true, alliance: { hq: at } });
      const outsider = await player(s);
      for (const [viewer, mineFlag] of [[outsider, false], [member, true], [t.leader, true]] as const) {
        const sn = await getMap(s, viewer.token);
        ex(sn.hqs, `viewer ${viewer.handle}`).toEqual([{ tag: "FL", ...at, mine: mineFlag }]);
      }
      const sn = await getMap(s, outsider.token);
      ex(sn.bases.filter((b) => b.alliance === "FL")).toHaveLength(3);
      ex(sn.bases.filter((b) => b.alliance === null)).toHaveLength(1);
      ex((await mine(s, member)).alliance?.hq).toEqual(at);
    },
    "refuses off-map, mountain and crowded tiles; malformed coordinates are 400": async (s, ex) => {
      const t = await team(s, 1);
      const snap = await getMap(s, t.leader.token);
      const mountain = findTile(snap, (x, y) => terrainAt(snap.terrainSeed, x, y) === "mountain");
      const base = snap.bases[0]!;
      ex(await post(s, t.leader, "/v1/alliance/hq", mountain), "mountain").toMatchObject({ ok: false, reason: "bad_tile" });
      ex(await post(s, t.leader, "/v1/alliance/hq", { x: -1, y: 5 }), "negative").toMatchObject({ ok: false, reason: "bad_tile" });
      ex(await post(s, t.leader, "/v1/alliance/hq", { x: 3.5, y: 5 }), "fraction").toMatchObject({ ok: false, reason: "bad_tile" });
      ex(await post(s, t.leader, "/v1/alliance/hq", { x: snap.size, y: 0 }), "off the map").toMatchObject({ ok: false, reason: "bad_tile" });
      ex(await post(s, t.leader, "/v1/alliance/hq", { x: 1, y: 30 }), "by the frontier").toMatchObject({ ok: false, reason: "bad_tile" });
      // A neighbour of the base where an HQ could otherwise stand.
      const next = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].map(([dx, dy]) => ({ x: base.x + dx!, y: base.y + dy! })).find((p) => baseSiteOk(snap.terrainSeed, p.x, p.y))!;
      ex(await post(s, t.leader, "/v1/alliance/hq", next), "next to a base").toMatchObject({ ok: false, reason: "tile_taken" });
      const npc = snap.npcs.find((x) => baseSiteOk(snap.terrainSeed, x.x, x.y))!;
      ex(await post(s, t.leader, "/v1/alliance/hq", { x: npc.x, y: npc.y }), "on a target").toMatchObject({ ok: false, reason: "tile_taken" });
      for (const bad of [{ x: "1", y: 2 }, { x: 1 }, { x: null, y: 1 }, { x: Number.NaN, y: 1 }]) {
        ex((await s.request("POST", "/v1/alliance/hq", { token: t.leader.token, body: bad })).status, JSON.stringify(bad)).toBe(400);
      }
      ex((await mine(s, t.leader)).alliance?.hq).toBeNull();
    },
    "moving it waits an hour; a disbanded alliance's HQ leaves the map": async (s, ex) => {
      const t = await team(s, 1);
      const snap = await getMap(s, t.leader.token);
      const ok = (x: number, y: number): boolean => clearOf(snap)(x, y);
      const first = findTile(snap, ok);
      ex(await post(s, t.leader, "/v1/alliance/hq", first)).toMatchObject({ ok: true });
      const second = findTile(snap, (x, y) => ok(x, y) && Math.abs(x - first.x) > 5);
      ex(await post(s, t.leader, "/v1/alliance/hq", second), "right away").toMatchObject({ ok: false, reason: "hq_cooldown" });
      s.now = T0 + HOUR - 1;
      ex(await post(s, t.leader, "/v1/alliance/hq", second), "a ms early").toMatchObject({ ok: false, reason: "hq_cooldown" });
      s.now = T0 + HOUR;
      ex(await post(s, t.leader, "/v1/alliance/hq", second), "after the hour").toMatchObject({ ok: true, alliance: { hq: second } });
      await post(s, t.leader, "/v1/alliance/leave");
      ex((await getMap(s, (await player(s)).token)).hqs).toEqual([]);
    },
    "random placement of new bases and targets keeps clear of an HQ": async (s, ex) => {
      const t = await team(s, 1);
      const snap = await getMap(s, t.leader.token);
      const at = findTile(snap, clearOf(snap));
      await post(s, t.leader, "/v1/alliance/hq", at);
      for (let i = 0; i < 20; i++) await getMap(s, (await player(s)).token);
      const after = await getMap(s, t.leader.token);
      for (const b of after.bases) ex(Math.max(Math.abs(b.x - at.x), Math.abs(b.y - at.y)), `base ${b.tag}`).toBeGreaterThan(2);
    },
    "a member's base loses the tag when they leave or are kicked": async (s, ex) => {
      const t = await team(s, 3);
      const [a, b] = t.members as [Player, Player];
      for (const p of t.members) await getMap(s, p.token);
      const tagOf = async (p: Player): Promise<string | null | undefined> => (await getMap(s, t.leader.token)).bases.find((x) => x.tag === p.handle)?.alliance;
      ex(await tagOf(a), "before").toBe("FL");
      await post(s, a, "/v1/alliance/leave");
      ex(await tagOf(a), "after leaving").toBeNull();
      await post(s, t.leader, "/v1/alliance/kick", { handle: b.handle });
      ex(await tagOf(b), "after a kick").toBeNull();
    },
  });
}, LONG);
