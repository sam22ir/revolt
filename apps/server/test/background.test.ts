import { chaptersFor, heroesFor, HEROES_BY_BACKGROUND, type BackgroundId } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MANY_GUESTS, create, join, call, type Player } from "./alliance-helpers.ts";
import { body, startServer, type Json, type Server } from "./harness.ts";
import { editBase, getMap, getState, heroIntent, intent } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer({ ...MANY_GUESTS });
});
afterEach(() => server.dispose());

const guestOn = async (bg?: unknown): Promise<{ token: string; res: Json }> => {
  const res = await body(await server.request("POST", "/v1/guest", { body: bg === undefined ? {} : { background: bg } }));
  return { token: res.token as string, res };
};

const playerOn = async (bg: BackgroundId): Promise<Player> => {
  const g = await guestOn(bg);
  return { token: g.token, id: g.res.account.id as string, handle: g.res.account.handle as string };
};

describe("POST /v1/guest background", () => {
  test("a Vietnam guest lands on vietnam-1; the default and an empty body are Algeria", async () => {
    const v = await guestOn("vietnam");
    expect(v.res.account.background).toBe("vietnam");
    expect((await getMap(server, v.token)).map).toBe("vietnam-1");
    for (const a of [await guestOn(), await guestOn("algeria")]) {
      expect(a.res.account.background).toBe("algeria");
      expect((await getMap(server, a.token)).map).toBe("algeria-1");
    }
  });

  test("garbage is a 400 and creates nothing", async () => {
    for (const bad of ["mars", "", 3, null, ["vietnam"], { x: 1 }, "Vietnam"]) {
      const res = await server.request("POST", "/v1/guest", { body: { background: bad } });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    const n = await server.env.DB.prepare("SELECT COUNT(*) AS n FROM accounts").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  test("the background is in /v1/state's account and survives a later request", async () => {
    const v = await guestOn("vietnam");
    const st = await body(await server.request("GET", "/v1/state", { token: v.token }));
    expect(st.account.background).toBe("vietnam");
  });

  test("an old Algeria save imports only into Algeria", async () => {
    const m1 = { v: 1 };
    const res = await body(await server.request("POST", "/v1/guest", { body: { background: "vietnam", importSave: m1 } }));
    expect(res.imported).toBe(false);
    expect(res.account.background).toBe("vietnam");
  });
});

describe("separation of the two servers", () => {
  test("players on different servers never see each other on the map", async () => {
    const a = await playerOn("algeria");
    const v = await playerOn("vietnam");
    const seenByA = await getMap(server, a.token);
    const seenByV = await getMap(server, v.token);
    expect(seenByA.bases).toHaveLength(1);
    expect(seenByV.bases).toHaveLength(1);
    expect(seenByA.bases[0]).toMatchObject({ mine: true });
    expect(seenByV.bases[0]).toMatchObject({ mine: true });
    expect(seenByA.map).not.toBe(seenByV.map);
    const w = await playerOn("vietnam");
    await getMap(server, w.token);
    expect((await getMap(server, v.token)).bases).toHaveLength(2);
    expect((await getMap(server, a.token)).bases).toHaveLength(1);
  });

  test("the same alliance name and tag can exist on both servers, and search and join stay on one", async () => {
    const a = await playerOn("algeria");
    const v = await playerOn("vietnam");
    const madeA = await create(server, a, "Free Lands", "FL");
    const madeV = await create(server, v, "Free Lands", "FL");
    expect(madeA.ok).toBe(true);
    expect(madeV.ok).toBe(true);
    expect(madeA.alliance.id).not.toBe(madeV.alliance.id);
    const outsider = await playerOn("vietnam");
    const found = await call(server, outsider, "GET", "/v1/alliances?q=Free");
    expect(found.alliances.map((x: Json) => x.id)).toEqual([madeV.alliance.id]);
    // Joining by an id from the other server finds no such alliance.
    const crossed = await join(server, outsider, madeA.alliance.id);
    expect(crossed).toMatchObject({ ok: false, reason: "alliance_gone" });
    expect((await join(server, outsider, madeV.alliance.id)).ok).toBe(true);
  });

  test("the same handle can exist on both servers but not twice on one", async () => {
    const insert = (id: string, server_: string): Promise<unknown> =>
      server.env.DB.prepare("INSERT INTO accounts (id, created_at, handle, server) VALUES (?, 0, 'ABCDEF', ?)").bind(id, server_).run();
    await insert("a1", "algeria-1");
    await insert("v1", "vietnam-1");
    await expect(insert("v2", "vietnam-1")).rejects.toThrow();
  });
});

describe("story and heroes per background", () => {
  test("a Vietnam story claim pays Vietnam heroes only", async () => {
    const v = await playerOn("vietnam");
    expect((await body(await intent(server, v.token, { type: "upgrade", building: "hq" }))).ok).toBe(true);
    server.now += 60_000;
    const r = await body(await intent(server, v.token, { type: "story_claim" }));
    expect(r.ok).toBe(true);
    expect(r.state.story.chapter).toBe(1);
    const reward = chaptersFor("vietnam")[0]!.reward.shards;
    expect(r.state.heroes.trail_scout.shards).toBe(reward.trail_scout);
    for (const id of HEROES_BY_BACKGROUND.algeria) expect(r.state.heroes[id].shards, id).toBe(0);
    expect(await getState(server, v.token)).toEqual(r.state);
    expect((await heroIntent(server, v.token, "hero_recruit", "trail_scout")).ok).toBe(true);
  });

  test("an Algeria hero is refused for a Vietnam account, and the other way round, even with the shards", async () => {
    const v = await playerOn("vietnam");
    const a = await playerOn("algeria");
    const rich = (s: Json): void => {
      s.resources.support = 500;
      for (const id of [...heroesFor("algeria"), ...heroesFor("vietnam")]) s.heroes[id].shards = 100;
    };
    await editBase(server, v.id, rich);
    await editBase(server, a.id, rich);
    expect(await heroIntent(server, v.token, "hero_recruit", "courier")).toMatchObject({ ok: false, reason: "unknown_hero" });
    expect(await heroIntent(server, a.token, "hero_recruit", "trail_scout")).toMatchObject({ ok: false, reason: "unknown_hero" });
    expect((await heroIntent(server, v.token, "hero_recruit", "column_commander")).ok).toBe(true);
    expect((await heroIntent(server, a.token, "hero_recruit", "field_commander")).ok).toBe(true);
    // Not recruited, so it can neither level up nor march.
    expect(await heroIntent(server, v.token, "hero_level", "courier")).toMatchObject({ ok: false, reason: "not_recruited" });
  });

  test("an old stored base with six heroes is read, migrated and played", async () => {
    const a = await playerOn("algeria");
    await editBase(server, a.id, (s) => {
      for (const id of HEROES_BY_BACKGROUND.vietnam) delete s.heroes[id];
    });
    const st = await getState(server, a.token);
    expect(st.heroes.trail_scout).toEqual({ level: 0, shards: 0 });
    expect((await body(await intent(server, a.token, { type: "upgrade", building: "hq" }))).ok).toBe(true);
  });
});

describe("Google sign-in and the background", () => {
  const signIn = async (token: string, sub: string): Promise<Json> =>
    body(await server.request("POST", "/v1/auth/google", { token, body: { idToken: await server.idToken(sub, `${sub}@example.com`) } }));

  test("linking Google keeps the guest's Vietnam account", async () => {
    const v = await guestOn("vietnam");
    const r = await signIn(v.token, "g-viet");
    expect(r.switched).toBe(false);
    expect(r.account.background).toBe("vietnam");
  });

  test("a second device switches to the existing account whatever it had; the background never changes", async () => {
    const v = await guestOn("vietnam");
    await signIn(v.token, "g-viet");
    const other = await guestOn("algeria");
    const r = await signIn(other.token, "g-viet");
    expect(r.switched).toBe(true);
    expect(r.account.background).toBe("vietnam");
    expect(r.account.id).toBe(v.res.account.id);
    expect((await getMap(server, r.token)).map).toBe("vietnam-1");
  });

  test("a body background is ignored by Google sign-in", async () => {
    const a = await guestOn("algeria");
    const res = await body(await server.request("POST", "/v1/auth/google", { token: a.token, body: { idToken: await server.idToken("g-a"), background: "vietnam" } }));
    expect(res.account.background).toBe("algeria");
  });

  test("a device linked to one Google account that signs in with another gets a new account on its own server", async () => {
    const v = await guestOn("vietnam");
    await signIn(v.token, "g-one");
    const r = await signIn(v.token, "g-two");
    expect(r.switched).toBe(true);
    expect(r.account.id).not.toBe(v.res.account.id);
    expect(r.account.background).toBe("vietnam");
  });
});
