import { advance, createBaseState, M1_IMPORT_MAX_LEVEL, NO_WORLD, START_TROOPS, startUpgrade, storageCap, ZERO_TROOPS } from "@revolt/rules";
import { test } from "vitest";
import { ipBucket } from "../src/client-ip.ts";
import { hashToken } from "../src/auth/tokens.ts";
import { isHandleCollision, newHandle, withNewHandle } from "../src/db/accounts.ts";
import { deleteOldGuestRate } from "../src/db/guest-rate.ts";
import { MANY_GUESTS, player } from "./alliance-helpers.ts";
import { body, CLIENT_ID, DAY, HOUR, keypair, MIN, newGuest, signIdToken, T0, type Server } from "./harness.ts";
import { LONG, rows } from "./rows.ts";

const state = (s: Server, token: string): Promise<Response> => s.request("GET", "/v1/state", { token });
const upgradeHq = (s: Server, token: string): Promise<Response> => s.request("POST", "/v1/intent", { token, body: { type: "upgrade", building: "hq" } });
const signIn = (s: Server, token: string, idToken: string): Promise<Response> => s.request("POST", "/v1/auth/google", { token, body: { idToken } });

const lastUsed = async (s: Server, token: string): Promise<number | null> =>
  (await s.env.DB.prepare("SELECT last_used_at FROM sessions WHERE token_hash = ?").bind(await hashToken(token)).first<{ last_used_at: number }>())?.last_used_at ?? null;
const lastSeen = async (s: Server, accountId: string): Promise<number | null> =>
  (await s.env.DB.prepare("SELECT last_seen_at FROM accounts WHERE id = ?").bind(accountId).first<{ last_seen_at: number | null }>())?.last_seen_at ?? null;

test("guest accounts: creation, token reload, bad tokens, unknown routes, CORS", async () => {
  await rows({}, {
    "a new device gets a guest account, a token and a fresh base at server time": async (s, ex) => {
      const res = await s.request("POST", "/v1/guest");
      ex(res.status).toBe(201);
      const b = await body(res);
      ex(b.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      ex(b.account.google).toBeNull();
      ex(b.state).toEqual(createBaseState(T0));
      ex(b.now).toBe(T0);
      ex(b.imported).toBe(false);
    },
    "the token reloads the same base": async (s, ex) => {
      const a = await newGuest(s);
      const b = await body(await state(s, a.token));
      ex(b.account.id).toBe(a.res.account.id);
      ex(b.state).toEqual(createBaseState(T0));
    },
    "two guests are separate accounts": async (s, ex) => {
      const a = await newGuest(s);
      const b = await newGuest(s);
      ex(a.res.account.id).not.toBe(b.res.account.id);
      ex(a.token).not.toBe(b.token);
    },
    "missing, malformed or unknown tokens are rejected": async (s, ex) => {
      ex((await s.request("GET", "/v1/state")).status, "missing").toBe(401);
      ex((await state(s, "short")).status, "malformed").toBe(401);
      ex((await state(s, "x".repeat(43))).status, "unknown").toBe(401);
    },
  });
}, LONG);

test("http: unknown routes and CORS preflight", async () => {
  await rows({}, {
    "unknown routes are 404": async (s, ex) => {
      ex((await s.request("GET", "/nope")).status).toBe(404);
    },
    "CORS preflight is answered for allowed origins only": async (s, ex) => {
      const ok = await s.request("OPTIONS", "/v1/intent", { origin: "http://localhost:4173" });
      ex(ok.status).toBe(204);
      ex(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:4173");
      ex(ok.headers.get("access-control-allow-headers")).toContain("authorization");
      const other = await s.request("OPTIONS", "/v1/intent", { origin: "https://evil.example" });
      ex(other.headers.get("access-control-allow-origin")).toBeNull();
    },
  });
}, LONG);

test("server time: resources accrue, cap, clock going backwards, lazy upgrade completion", async () => {
  await rows({}, {
    "resources accrue with server time": async (s, ex) => {
      const a = await newGuest(s);
      s.now = T0 + HOUR;
      const b = await body(await state(s, a.token));
      ex(b.state).toEqual(advance(createBaseState(T0), T0 + HOUR, NO_WORLD));
      ex(b.now).toBe(T0 + HOUR);
    },
    "a very long offline gap stops at the storage cap": async (s, ex) => {
      const a = await newGuest(s);
      s.now = T0 + 365 * DAY;
      const b = await body(await state(s, a.token));
      ex(b.state.resources).toEqual(storageCap(1));
    },
    "the server clock going backwards never loses production": async (s, ex) => {
      const a = await newGuest(s);
      s.now = T0 + HOUR;
      await upgradeHq(s, a.token);
      s.now = T0 - DAY;
      const b = await body(await state(s, a.token));
      const expected = startUpgrade(createBaseState(T0), "hq", T0 + HOUR, NO_WORLD);
      if (!expected.ok) throw new Error(expected.reason);
      ex(b.state).toEqual(expected.state);
    },
    "an upgrade completes at server time, read lazily": async (s, ex) => {
      const a = await newGuest(s);
      const r = await body(await upgradeHq(s, a.token));
      ex(r.ok).toBe(true);
      s.now = r.state.queue.endsAt - 1;
      ex((await body(await state(s, a.token))).state.levels.hq, "one ms early").toBe(1);
      s.now = r.state.queue.endsAt;
      const done = await body(await state(s, a.token));
      ex(done.state.levels.hq).toBe(2);
      ex(done.state.queue).toBeNull();
    },
  });
}, LONG);

test("M1 save import: bounded, troop-free, no import for existing accounts", async () => {
  const forged = {
    resources: { food: 1e12, materiel: 1e12, funds: 1e12, support: 1e12 },
    levels: { hq: 10, farm: 10, armory: 10, treasury: 10 },
    queue: null,
    lastUpdated: T0 - DAY,
  };
  await rows({}, {
    "a plausible local save becomes the guest's base": async (s, ex) => {
      const r = startUpgrade(createBaseState(T0 - HOUR), "hq", T0 - HOUR, NO_WORLD);
      if (!r.ok) throw new Error(r.reason);
      const a = await newGuest(s, r.state);
      ex(a.res.imported).toBe(true);
      ex(a.res.state).toEqual(r.state);
    },
    "a forged save is bounded": async (s, ex) => {
      const a = await newGuest(s, forged);
      ex(a.res.state.levels).toEqual({ hq: M1_IMPORT_MAX_LEVEL, farm: 3, armory: 3, treasury: 3, barracks: 1, hero_hall: 1, watchtower: 1, infirmary: 1 });
      ex(a.res.state.resources).toEqual(storageCap(M1_IMPORT_MAX_LEVEL));
    },
    "a save can never bring troops, wounded, training or marches": async (s, ex) => {
      const army = { infantry: 1_000_000, scouts: 1_000_000, heavy: 1_000_000, porters: 0 };
      const march = { id: "x", target: { npcId: "n", level: 1, x: 1, y: 1 }, from: { x: 0, y: 0 }, troops: army, departAt: T0, arriveAt: T0, returnAt: T0 + 1, outcome: null };
      const a = await newGuest(s, {
        ...forged,
        levels: { ...forged.levels, barracks: 10 },
        troops: army,
        wounded: army,
        training: { troop: "heavy", count: 1_000_000, startedAt: T0 - DAY, endsAt: T0 - DAY + 1 },
        marches: [march],
      });
      ex(a.res.imported).toBe(true);
      ex(a.res.state).toMatchObject({ troops: START_TROOPS, wounded: ZERO_TROOPS, training: null, marches: [] });
      ex(a.res.state.levels.barracks).toBe(M1_IMPORT_MAX_LEVEL);
    },
    "clearing the session and importing again only ever yields another bounded base": async (s, ex) => {
      const first = await newGuest(s, forged);
      const second = await newGuest(s, forged);
      ex(second.res.account.id).not.toBe(first.res.account.id);
      ex(second.res.state.levels.hq).toBe(M1_IMPORT_MAX_LEVEL);
    },
    "an invalid save gives a fresh base": async (s, ex) => {
      const a = await newGuest(s, { levels: "lots" });
      ex(a.res.imported).toBe(false);
      ex(a.res.state).toEqual(createBaseState(T0));
    },
    "an existing account cannot import: there is no import route for it": async (s, ex) => {
      const a = await newGuest(s);
      const res = await s.request("POST", "/v1/state", { token: a.token, body: { importSave: forged } });
      ex(res.status).toBe(404);
      ex((await body(await state(s, a.token))).state).toEqual(createBaseState(T0));
    },
  });
}, LONG);

test("guest rate limit per client IP", async () => {
  const LIMIT = 3;
  const guest = (s: Server, ip?: string): Promise<Response> => s.request("POST", "/v1/guest", ip === undefined ? {} : { ip });
  const count = async (s: Server, table: string): Promise<number> => (await s.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? 0;
  await rows({ GUEST_LIMIT_PER_HOUR: String(LIMIT) }, {
    "the limit is allowed, the next one gets 429 rate_limited": async (s, ex) => {
      for (let i = 0; i < LIMIT; i++) ex((await guest(s, "203.0.113.7")).status, `guest ${i}`).toBe(201);
      const res = await guest(s, "203.0.113.7");
      ex(res.status).toBe(429);
      ex(await body(res)).toEqual({ error: "rate_limited" });
    },
    "a refused request creates no account": async (s, ex) => {
      for (let i = 0; i <= LIMIT; i++) await guest(s, "203.0.113.7");
      ex(await count(s, "accounts")).toBe(LIMIT);
    },
    "the limit is checked before the body is read": async (s, ex) => {
      for (let i = 0; i < LIMIT; i++) await guest(s, "203.0.113.7");
      ex((await s.request("POST", "/v1/guest", { ip: "203.0.113.7", raw: "x".repeat(20_000) })).status).toBe(429);
    },
    "other IPs are counted separately": async (s, ex) => {
      for (let i = 0; i < LIMIT; i++) await guest(s, "203.0.113.7");
      ex((await guest(s, "203.0.113.7")).status).toBe(429);
      ex((await guest(s, "198.51.100.1")).status).toBe(201);
    },
    "one IPv6 /64 is one bucket": async (s, ex) => {
      for (let i = 0; i < LIMIT; i++) ex((await guest(s, `2001:db8:1:2::${i + 1}`)).status, `v6 ${i}`).toBe(201);
      ex((await guest(s, "2001:db8:1:2:ffff:ffff:ffff:ffff")).status).toBe(429);
      ex((await guest(s, "2001:db8:1:3::1")).status).toBe(201);
    },
    "requests without a client IP share one bucket": async (s, ex) => {
      for (let i = 0; i < LIMIT; i++) ex((await guest(s)).status, `no-ip ${i}`).toBe(201);
      ex((await guest(s)).status).toBe(429);
    },
    "the next hour's window allows guests again": async (s, ex) => {
      for (let i = 0; i < LIMIT; i++) await guest(s, "203.0.113.7");
      s.now = T0 + HOUR - 1;
      ex((await guest(s, "203.0.113.7")).status, "last ms of the window").toBe(429);
      s.now = T0 + HOUR;
      ex((await guest(s, "203.0.113.7")).status, "next window").toBe(201);
    },
    "the clock going backwards neither crashes nor lifts a full window": async (s, ex) => {
      s.now = T0 + HOUR;
      for (let i = 0; i < LIMIT; i++) await guest(s, "203.0.113.7");
      s.now = T0;
      ex((await guest(s, "203.0.113.7")).status, "earlier, empty window").toBe(201);
      s.now = T0 + HOUR + 1;
      ex((await guest(s, "203.0.113.7")).status, "full window again").toBe(429);
    },
    "the IP is never stored in clear": async (s, ex) => {
      await guest(s, "203.0.113.7");
      const r = await s.env.DB.prepare("SELECT bucket FROM guest_rate").first<{ bucket: string }>();
      ex(r?.bucket).toMatch(/^[0-9a-f]{64}$/);
    },
    "old windows are deleted, the current one is kept": async (s, ex) => {
      await guest(s, "203.0.113.7");
      s.now = T0 + HOUR;
      await guest(s, "203.0.113.7");
      ex(await count(s, "guest_rate"), "before").toBe(2);
      ex(await deleteOldGuestRate(s.env.DB, s.now)).toBe(1);
      ex(await count(s, "guest_rate"), "after").toBe(1);
    },
    "IPv4 is the address, IPv6 is its /64": async (_s, ex) => {
      const req = (ip?: string): Request => new Request("http://api.test/", ip === undefined ? {} : { headers: { "cf-connecting-ip": ip } });
      ex(ipBucket(req("203.0.113.7")), "v4").toBe("203.0.113.7");
      ex(ipBucket(req("2001:0db8:0001:0002:0003:0004:0005:0006")), "full v6").toBe("2001:db8:1:2::/64");
      ex(ipBucket(req("2001:DB8:1:2::9")), "upper case").toBe("2001:db8:1:2::/64");
      ex(ipBucket(req("2001:db8::1")), "compressed").toBe("2001:db8:0:0::/64");
      ex(ipBucket(req("::1")), "loopback").toBe("0:0:0:0::/64");
      ex(ipBucket(req()), "no header").toBe("unknown");
    },
  });
  await rows({ GUEST_LIMIT_PER_HOUR: "nope" }, {
    "an invalid configured limit falls back to the default": async (s, ex) => {
      for (let i = 0; i < 5; i++) ex((await guest(s, "203.0.113.7")).status, `guest ${i}`).toBe(201);
    },
  });
}, LONG);

test("player handles", async () => {
  await rows(MANY_GUESTS, {
    "every account gets a short public handle, shown on its own account and nowhere with its id": async (s, ex) => {
      const a = await player(s);
      const b = await player(s);
      ex(a.handle).toMatch(/^[A-Z2-9]{6}$/);
      ex(b.handle).not.toBe(a.handle);
      const got = await body(await state(s, a.token));
      ex(got.account.handle).toBe(a.handle);
    },
    "handles are unique per server: a duplicate is refused by the index and retried with a new one": async (s, ex) => {
      const a = await player(s);
      let refused: unknown = null;
      try {
        await s.env.DB.prepare("INSERT INTO accounts (id, created_at, handle) VALUES ('x', 1, ?)").bind(a.handle).run();
      } catch (e) {
        refused = e;
      }
      ex(refused !== null && isHandleCollision(refused), "index refuses a duplicate").toBe(true);
      const seen: string[] = [];
      const h = await withNewHandle(async (handle) => {
        seen.push(handle);
        if (seen.length < 3) throw new Error("UNIQUE constraint failed: accounts.server, accounts.handle");
        return handle;
      });
      ex(seen).toHaveLength(3);
      ex(h).toBe(seen[2]);
      ex(newHandle()).toMatch(/^[A-Z2-9]{6}$/);
    },
  });
}, LONG);

test("Google sign-in: linking a guest and verifying ID tokens", async () => {
  await rows({}, {
    "links Google to the guest account and keeps its base": async (s, ex) => {
      const a = await newGuest(s);
      await upgradeHq(s, a.token);
      const res = await signIn(s, a.token, await s.idToken("g-1", "player@example.com"));
      ex(res.status).toBe(200);
      const b = await body(res);
      ex(b.switched).toBe(false);
      ex(b.token).toBe(a.token);
      ex(b.account).toEqual({ background: "algeria", id: a.res.account.id, handle: a.res.account.handle, google: { email: "player@example.com" } });
      ex(b.state.queue.building).toBe("hq");
    },
    "signing in again with the same Google account is a no-op": async (s, ex) => {
      const a = await newGuest(s);
      await signIn(s, a.token, await s.idToken("g-1"));
      const b = await body(await signIn(s, a.token, await s.idToken("g-1")));
      ex(b.switched).toBe(false);
      ex(b.token).toBe(a.token);
      ex(b.account.id).toBe(a.res.account.id);
    },
    "an account linked to one Google account signing in with another gets a new account": async (s, ex) => {
      const a = await newGuest(s);
      await signIn(s, a.token, await s.idToken("g-1"));
      const b = await body(await signIn(s, a.token, await s.idToken("g-2")));
      ex(b.switched).toBe(true);
      ex(b.account.id).not.toBe(a.res.account.id);
      ex(b.state).toEqual(createBaseState(T0));
    },
    "requires the device's session": async (s, ex) => {
      ex((await s.request("POST", "/v1/auth/google", { body: { idToken: await s.idToken("g-1") } })).status).toBe(401);
    },
  });
  await rows({ GOOGLE_CLIENT_IDS: "" }, {
    "Google sign-in is refused when no client ID is configured": async (s, ex) => {
      const a = await newGuest(s);
      ex((await s.request("POST", "/v1/auth/google", { token: a.token, body: { idToken: await s.idToken("g-1") } })).status).toBe(503);
    },
  });
}, LONG);

test("Google ID token verification", async () => {
  const t = Math.floor(T0 / 1000);
  await rows({}, {
    "rejects forged, foreign, expired and malformed tokens": async (s, ex) => {
      const a = await newGuest(s);
      const attacker = await keypair("google-1"); // same kid, different key
      const bad: [string, string][] = [
        ["forged", await signIdToken(attacker, { sub: "g-1", iat: t, exp: t + 3600 })],
        ["foreign audience", await s.idToken("g-1", undefined, { aud: "someone-elses-client" })],
        ["foreign issuer", await s.idToken("g-1", undefined, { iss: "https://evil.example" })],
        ["expired", await s.idToken("g-1", undefined, { iat: t - 7200, exp: t - 3600 })],
        ["malformed", "not.a.jwt"],
      ];
      for (const [what, idToken] of bad) ex((await signIn(s, a.token, idToken)).status, what).toBe(401);
      ex((await s.request("POST", "/v1/auth/google", { token: a.token, body: { idToken: 42 } })).status, "non-string").toBe(400);
      ex((await body(await state(s, a.token))).account.google, "still a plain guest").toBeNull();
    },
    "accepts both issuer forms Google uses": async (s, ex) => {
      const a = await newGuest(s);
      ex((await signIn(s, a.token, await s.idToken("g-1", undefined, { iss: "accounts.google.com" }))).status).toBe(200);
      const b = await newGuest(s);
      ex((await signIn(s, b.token, await s.idToken("g-2", undefined, { iss: "https://accounts.google.com" }))).status).toBe(200);
    },
    "an unverified email is not stored": async (s, ex) => {
      const a = await newGuest(s);
      const tok = await signIdToken(s.google, { sub: "g-1", iat: t, exp: t + 3600, aud: CLIENT_ID });
      ex((await body(await signIn(s, a.token, tok))).account.google).toEqual({ email: null });
    },
  });
}, LONG);

test("Google sign-in on two devices", async () => {
  await rows({}, {
    "signing in with the linked Google account on a second device loads the same base": async (s, ex) => {
      // Device A: guest, upgrades the HQ, links Google.
      const a = await newGuest(s);
      await upgradeHq(s, a.token);
      await signIn(s, a.token, await s.idToken("g-1", "player@example.com"));
      // Device B, an hour later: first launch makes a guest, then the player signs in with Google.
      s.now = T0 + HOUR;
      const b = await newGuest(s);
      const res = await body(await signIn(s, b.token, await s.idToken("g-1", "player@example.com")));
      ex(res.switched).toBe(true);
      ex(res.token).not.toBe(b.token);
      ex(res.token).not.toBe(a.token);
      ex(res.account.id).toBe(a.res.account.id);
      const fromA = await body(await state(s, a.token));
      const fromB = await body(await state(s, res.token));
      ex(fromB).toEqual(fromA);
      ex(fromB.state.levels.hq).toBe(2);
      // A change made on B is seen on A.
      ex((await body(await s.request("POST", "/v1/intent", { token: res.token, body: { type: "upgrade", building: "farm" } }))).ok).toBe(true);
      const later = await body(await state(s, a.token));
      ex(later.state.queue.building).toBe("farm");
    },
    "two guests linking the same Google account at once end up on one account": async (s, ex) => {
      const a = await newGuest(s);
      const b = await newGuest(s);
      const [ra, rb] = await Promise.all([
        signIn(s, a.token, await s.idToken("g-1")).then(body),
        signIn(s, b.token, await s.idToken("g-1")).then(body),
      ]);
      ex(ra.account.id).toBe(rb.account.id);
      ex([ra.switched, rb.switched].filter(Boolean)).toHaveLength(1);
    },
  });
}, LONG);

test("sessions: logout, device switch, last_used_at, last_seen_at", async () => {
  /** Two sessions of one linked Google account: [first, second]. */
  const twoSessions = async (s: Server): Promise<[Awaited<ReturnType<typeof newGuest>>, string]> => {
    const a = await newGuest(s);
    await signIn(s, a.token, await s.idToken("g-1"));
    const b = await newGuest(s);
    const second = await body(await signIn(s, b.token, await s.idToken("g-1")));
    return [a, second.token as string];
  };
  await rows({}, {
    "ends the session: the token is rejected afterwards": async (s, ex) => {
      const a = await newGuest(s);
      const res = await s.request("POST", "/v1/logout", { token: a.token });
      ex(res.status).toBe(200);
      ex(await body(res)).toEqual({ ok: true, now: T0 });
      ex((await state(s, a.token)).status).toBe(401);
      ex(await lastUsed(s, a.token)).toBeNull();
      ex((await s.request("POST", "/v1/logout", { token: a.token })).status, "second logout").toBe(401);
    },
    "other sessions of the same account stay signed in": async (s, ex) => {
      const [a, secondToken] = await twoSessions(s);
      await s.request("POST", "/v1/logout", { token: a.token });
      ex((await state(s, a.token)).status).toBe(401);
      ex((await state(s, secondToken)).status).toBe(200);
    },
    "records when the account was last seen, never moving it backwards": async (s, ex) => {
      const [a, secondToken] = await twoSessions(s);
      const id = a.res.account.id as string;
      ex(await lastSeen(s, id), "before any logout").toBeNull();
      s.now = T0 + 2 * HOUR;
      await s.request("POST", "/v1/logout", { token: a.token });
      ex(await lastSeen(s, id)).toBe(T0 + 2 * HOUR);
      s.now = T0 + HOUR;
      await s.request("POST", "/v1/logout", { token: secondToken });
      ex(await lastSeen(s, id), "earlier logout").toBe(T0 + 2 * HOUR);
    },
    "needs a valid token": async (s, ex) => {
      ex((await s.request("POST", "/v1/logout")).status).toBe(401);
      ex((await s.request("POST", "/v1/logout", { token: "x".repeat(43) })).status).toBe(401);
    },
    "the guest token left behind no longer works": async (s, ex) => {
      const a = await newGuest(s);
      await signIn(s, a.token, await s.idToken("g-1"));
      s.now = T0 + MIN;
      const b = await newGuest(s);
      const res = await body(await signIn(s, b.token, await s.idToken("g-1")));
      ex(res.switched).toBe(true);
      ex((await state(s, b.token)).status).toBe(401);
      ex((await state(s, res.token)).status).toBe(200);
      ex(await lastSeen(s, b.res.account.id)).toBe(T0 + MIN);
    },
    "linking a guest in place keeps its session": async (s, ex) => {
      const a = await newGuest(s);
      await signIn(s, a.token, await s.idToken("g-1"));
      ex((await state(s, a.token)).status).toBe(200);
    },
  });
}, LONG);

test("sessions.last_used_at", async () => {
  await rows({}, {
    "is not rewritten within the hour": async (s, ex) => {
      const a = await newGuest(s);
      s.now = T0 + HOUR - 1;
      await state(s, a.token);
      ex(await lastUsed(s, a.token)).toBe(T0);
    },
    "is refreshed once an hour has passed": async (s, ex) => {
      const a = await newGuest(s);
      s.now = T0 + HOUR;
      await state(s, a.token);
      ex(await lastUsed(s, a.token)).toBe(T0 + HOUR);
      s.now = T0 + HOUR + 30 * MIN;
      await state(s, a.token);
      ex(await lastUsed(s, a.token), "half an hour later").toBe(T0 + HOUR);
    },
    "is refreshed by any authenticated route": async (s, ex) => {
      const a = await newGuest(s);
      s.now = T0 + 2 * HOUR;
      await upgradeHq(s, a.token);
      ex(await lastUsed(s, a.token)).toBe(T0 + 2 * HOUR);
    },
    "never moves backwards when the clock does": async (s, ex) => {
      const a = await newGuest(s);
      s.now = T0 + 5 * HOUR;
      await state(s, a.token);
      s.now = T0 - 10 * HOUR;
      ex((await state(s, a.token)).status).toBe(200);
      ex(await lastUsed(s, a.token)).toBe(T0 + 5 * HOUR);
    },
    "concurrent requests write it once and all succeed": async (s, ex) => {
      const a = await newGuest(s);
      s.now = T0 + 3 * HOUR;
      const results = await Promise.all([state(s, a.token), state(s, a.token), state(s, a.token)]);
      ex(results.map((r) => r.status)).toEqual([200, 200, 200]);
      ex(await lastUsed(s, a.token)).toBe(T0 + 3 * HOUR);
    },
  });
}, LONG);
