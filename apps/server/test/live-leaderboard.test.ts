import { compareEntries, eventWindow, LEADERBOARD_PAGE, playerPower, type BoardEntry, createBaseState } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { create, join, player as allianceMember } from "./alliance-helpers.ts";
import { startServer, T0, type Server } from "./harness.ts";
import { editBase } from "./map-helpers.ts";
import { fighter, get, inWindow, seedAward, sql } from "./live-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer({ GUEST_LIMIT_PER_HOUR: "100000" });
  server.now = inWindow("supply_route", 40);
});
afterEach(() => server.dispose());

/** Fake rivals straight into the tables: an account with a handle on a server, and optionally a snapshot. */
const rival = async (handle: string, srv: string, power: number, regions = 0, reached = T0): Promise<string> => {
  const id = `rival-${handle}-${srv}`;
  await server.env.DB.prepare("INSERT INTO accounts (id, created_at, handle, server) VALUES (?, ?, ?, ?)").bind(id, T0, handle, srv).run();
  await server.env.DB.prepare("INSERT INTO score_snapshots (account_id, server, power, regions, updated_at) VALUES (?, ?, ?, ?, ?)").bind(id, srv, power, regions, reached).run();
  return id;
};

describe("power and regions boards", () => {
  test("rank players of the viewer's server by power, naming handles only", async () => {
    const f = await fighter(server);
    await editBase(server, f.id, () => undefined);
    await rival("AAAAAA", "algeria-1", 1_000_000);
    await rival("BBBBBB", "algeria-1", 5);
    const b = await get(server, f.token, "/v1/leaderboard?board=power");
    expect(b.board).toBe("power");
    expect(b.entries.map((e: { name: string }) => e.name)).toEqual(["AAAAAA", f.handle, "BBBBBB"]);
    expect(b.entries.map((e: { rank: number }) => e.rank)).toEqual([1, 2, 3]);
    expect(b.entries.filter((e: { mine: boolean }) => e.mine)).toHaveLength(1);
    expect(b.me.rank).toBe(2);
    // The player's own row was refreshed from the base at server time.
    expect(b.me.score).toBe(b.entries[1].score);
    // No account id appears anywhere in the answer.
    const text = JSON.stringify(b);
    expect(text).not.toContain(f.id);
    expect(text).not.toContain("rival-");
    expect(Object.keys(b.entries[0]).sort()).toEqual(["mine", "name", "rank", "score"]);
  });

  test("another server's players are not on the board", async () => {
    const f = await fighter(server);
    await rival("VVVVVV", "vietnam-1", 9_999_999);
    const names = (await get(server, f.token, "/v1/leaderboard?board=power")).entries.map((e: { name: string }) => e.name);
    expect(names).not.toContain("VVVVVV");
    const v = await fighter(server, "vietnam");
    const vNames = (await get(server, v.token, "/v1/leaderboard?board=power")).entries.map((e: { name: string }) => e.name);
    expect(vNames).toContain("VVVVVV");
    expect(vNames).not.toContain(f.handle);
  });

  test("ties go to whoever reached the score first, then the handle, and the SQL order agrees with the rules", async () => {
    const f = await fighter(server);
    const p = (await get(server, f.token, "/v1/leaderboard?board=power")).me.score as number;
    // Same power as the player: one earlier, one at the same instant with an earlier handle, one later.
    await rival("ZZZZZZ", "algeria-1", p, 0, 1);
    // "Same instant" means the player's own snapshot time, whatever the clock did while the fighter was set up.
    const mine = await sql<{ updated_at: number }>(server, `SELECT updated_at FROM score_snapshots WHERE account_id = '${f.id}'`);
    const at = mine[0]!.updated_at;
    await rival("AAAAAA", "algeria-1", p, 0, at);
    await rival("MMMMMM", "algeria-1", p, 0, at + 99);
    const b = await get(server, f.token, "/v1/leaderboard?board=power");
    const names = b.entries.map((e: { name: string }) => e.name);
    expect(names[0]).toBe("ZZZZZZ");
    expect(names.indexOf("AAAAAA")).toBeLessThan(names.indexOf(f.handle));
    expect(names[names.length - 1]).toBe("MMMMMM");
    const rows = await sql<{ handle: string; power: number; updated_at: number }>(
      server,
      "SELECT a.handle AS handle, s.power AS power, s.updated_at AS updated_at FROM score_snapshots s JOIN accounts a ON a.id = s.account_id",
    );
    const entries: BoardEntry[] = rows.map((r) => ({ handle: r.handle, score: r.power, reachedAt: r.updated_at }));
    expect(entries.sort(compareEntries).map((e) => e.handle)).toEqual(names);
  });

  test("a player outside the top 50 still sees their own rank", async () => {
    const f = await fighter(server);
    for (let i = 0; i < LEADERBOARD_PAGE + 5; i++) await rival(`R${String(i).padStart(5, "0")}`, "algeria-1", 10_000_000 - i);
    const b = await get(server, f.token, "/v1/leaderboard?board=power");
    expect(b.entries).toHaveLength(LEADERBOARD_PAGE);
    expect(b.entries.some((e: { mine: boolean }) => e.mine)).toBe(false);
    expect(b.me.rank).toBe(LEADERBOARD_PAGE + 6);
    expect(b.me.score).toBeGreaterThan(0);
  });

  test("the regions board counts story victories and leaves out players with none", async () => {
    const f = await fighter(server);
    await editBase(server, f.id, (s) => {
      s.story.victories = 4;
    });
    await rival("NONE00", "algeria-1", 50, 0);
    await rival("SOME00", "algeria-1", 50, 2);
    const b = await get(server, f.token, "/v1/leaderboard?board=regions");
    expect(b.entries.map((e: { name: string; score: number }) => [e.name, e.score])).toEqual([[f.handle, 4], ["SOME00", 2]]);
  });

  test("power follows the rules function for the player's base", async () => {
    const f = await fighter(server);
    const state = (await get(server, f.token, "/v1/state")).state;
    const b = await get(server, f.token, "/v1/leaderboard?board=power");
    expect(b.me.score).toBe(playerPower(state));
    expect(playerPower(state)).toBeGreaterThan(playerPower(createBaseState(T0)));
  });

  test("unknown boards and bad event keys are bad requests", async () => {
    const f = await fighter(server);
    expect((await server.request("GET", "/v1/leaderboard?board=gold", { token: f.token })).status).toBe(400);
    expect((await server.request("GET", "/v1/leaderboard?board=event&event=nope", { token: f.token })).status).toBe(400);
    expect((await server.request("GET", "/v1/leaderboard?board=event&event=vietnam_seasonal_placeholder:1", { token: f.token })).status).toBe(400);
    expect((await server.request("GET", "/v1/leaderboard?board=power")).status).toBe(401);
  });
});

describe("event board", () => {
  test("sums award rows per player for one window of the viewer's server", async () => {
    const a = await fighter(server);
    const b = await fighter(server);
    const key = eventWindow("supply_route", 40).key;
    await seedAward(server, a.id, key, 30);
    await seedAward(server, a.id, key, 30);
    await seedAward(server, b.id, key, 100);
    await seedAward(server, b.id, eventWindow("supply_route", 39).key, 9999);
    const v = await fighter(server, "vietnam");
    await seedAward(server, v.id, key, 5000, { server: "vietnam-1" });
    // Without a key it ranks the first open event of the viewer's server.
    expect((await get(server, a.token, "/v1/leaderboard?board=event")).event).toMatch(/^(supply_route|convoy_hunt|seasonal_campaign):\d+$/);
    const board = await get(server, a.token, `/v1/leaderboard?board=event&event=${key}`);
    expect(board.entries.map((e: { name: string; score: number }) => [e.name, e.score])).toEqual([[b.handle, 100], [a.handle, 60]]);
    expect(board.me).toEqual({ rank: 2, score: 60 });
  });

  test("a score reached earlier wins a tie", async () => {
    const a = await fighter(server);
    const b = await fighter(server);
    const key = eventWindow("supply_route", 40).key;
    await seedAward(server, b.id, key, 50, { at: server.now - 1000 });
    await seedAward(server, a.id, key, 50, { at: server.now });
    const board = await get(server, a.token, `/v1/leaderboard?board=event&event=${key}`);
    expect(board.entries.map((e: { name: string }) => e.name)).toEqual([b.handle, a.handle]);
  });
});

describe("alliance board", () => {
  test("ranks alliances by the sum of their members' power, and finds the viewer's own alliance", async () => {
    const leader = await allianceMember(server);
    const second = await allianceMember(server);
    const made = await create(server, leader, "Dawn Guard", "DG");
    await join(server, second, made.alliance.id);
    for (const p of [leader, second]) await get(server, p.token, "/v1/state");
    const rival1 = await allianceMember(server);
    const made2 = await create(server, rival1, "Lone Wolves", "LW");
    expect(made2.ok).toBe(true);
    await get(server, rival1.token, "/v1/state");
    const b = await get(server, leader.token, "/v1/leaderboard?board=alliance");
    expect(b.entries.map((e: { name: string }) => e.name)).toEqual(["Dawn Guard", "Lone Wolves"]);
    expect(b.entries[0].score).toBe(2 * b.entries[1].score);
    expect(b.entries[0].mine).toBe(true);
    expect(b.me.rank).toBe(1);
    // Someone with no alliance has no place on this board.
    const loner = await allianceMember(server);
    expect((await get(server, loner.token, "/v1/leaderboard?board=alliance")).me).toEqual({ rank: null, score: 0 });
  });
});
