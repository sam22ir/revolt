import { createBaseState } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { body, CLIENT_ID, HOUR, keypair, newGuest, signIdToken, startServer, T0, type Server } from "./harness.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer();
});
afterEach(() => server.dispose());

const signIn = async (token: string, idToken: string): Promise<Response> =>
  server.request("POST", "/v1/auth/google", { token, body: { idToken } });

describe("linking Google", () => {
  test("links Google to the guest account and keeps its base", async () => {
    const a = await newGuest(server);
    await server.request("POST", "/v1/intent", { token: a.token, body: { type: "upgrade", building: "hq" } });
    const res = await signIn(a.token, await server.idToken("g-1", "player@example.com"));
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.switched).toBe(false);
    expect(b.token).toBe(a.token);
    expect(b.account).toEqual({ background: "algeria", id: a.res.account.id, handle: a.res.account.handle, google: { email: "player@example.com" } });
    expect(b.state.queue.building).toBe("hq");
  });

  test("signing in again with the same Google account is a no-op", async () => {
    const a = await newGuest(server);
    await signIn(a.token, await server.idToken("g-1"));
    const b = await body(await signIn(a.token, await server.idToken("g-1")));
    expect(b.switched).toBe(false);
    expect(b.token).toBe(a.token);
    expect(b.account.id).toBe(a.res.account.id);
  });

  test("an account linked to one Google account signing in with another gets a new account", async () => {
    const a = await newGuest(server);
    await signIn(a.token, await server.idToken("g-1"));
    const b = await body(await signIn(a.token, await server.idToken("g-2")));
    expect(b.switched).toBe(true);
    expect(b.account.id).not.toBe(a.res.account.id);
    expect(b.state).toEqual(createBaseState(T0));
  });

  test("Google sign-in is refused when no client ID is configured", async () => {
    const off = await startServer({ GOOGLE_CLIENT_IDS: "" });
    const a = await newGuest(off);
    expect((await off.request("POST", "/v1/auth/google", { token: a.token, body: { idToken: await off.idToken("g-1") } })).status).toBe(503);
    await off.dispose();
  });

  test("requires the device's session", async () => {
    expect((await server.request("POST", "/v1/auth/google", { body: { idToken: await server.idToken("g-1") } })).status).toBe(401);
  });
});

describe("Google ID token verification", () => {
  const t = Math.floor(T0 / 1000);

  test("rejects forged, foreign, expired and malformed tokens", async () => {
    const a = await newGuest(server);
    const attacker = await keypair("google-1"); // same kid, different key
    const bad = [
      await signIdToken(attacker, { sub: "g-1", iat: t, exp: t + 3600 }),
      await server.idToken("g-1", undefined, { aud: "someone-elses-client" }),
      await server.idToken("g-1", undefined, { iss: "https://evil.example" }),
      await server.idToken("g-1", undefined, { iat: t - 7200, exp: t - 3600 }),
      "not.a.jwt",
    ];
    for (const idToken of bad) expect((await signIn(a.token, idToken)).status).toBe(401);
    expect((await server.request("POST", "/v1/auth/google", { token: a.token, body: { idToken: 42 } })).status).toBe(400);
    expect((await body(await server.request("GET", "/v1/state", { token: a.token }))).account.google).toBeNull();
  });

  test("accepts both issuer forms Google uses", async () => {
    const a = await newGuest(server);
    expect((await signIn(a.token, await server.idToken("g-1", undefined, { iss: "accounts.google.com" }))).status).toBe(200);
    const b = await newGuest(server);
    expect((await signIn(b.token, await server.idToken("g-2", undefined, { iss: "https://accounts.google.com" }))).status).toBe(200);
  });

  test("an unverified email is not stored", async () => {
    const a = await newGuest(server);
    const tok = await signIdToken(server.google, { sub: "g-1", iat: t, exp: t + 3600, aud: CLIENT_ID });
    expect((await body(await signIn(a.token, tok))).account.google).toEqual({ email: null });
  });
});

describe("two devices", () => {
  test("signing in with the linked Google account on a second device loads the same base", async () => {
    // Device A: guest, upgrades the HQ, links Google.
    const a = await newGuest(server);
    await server.request("POST", "/v1/intent", { token: a.token, body: { type: "upgrade", building: "hq" } });
    await signIn(a.token, await server.idToken("g-1", "player@example.com"));

    // Device B, an hour later: first launch makes a guest, then the player signs in with Google.
    server.now = T0 + HOUR;
    const b = await newGuest(server);
    const res = await body(await signIn(b.token, await server.idToken("g-1", "player@example.com")));
    expect(res.switched).toBe(true);
    expect(res.token).not.toBe(b.token);
    expect(res.token).not.toBe(a.token);
    expect(res.account.id).toBe(a.res.account.id);

    const fromA = await body(await server.request("GET", "/v1/state", { token: a.token }));
    const fromB = await body(await server.request("GET", "/v1/state", { token: res.token }));
    expect(fromB).toEqual(fromA);
    expect(fromB.state.levels.hq).toBe(2);

    // A change made on B is seen on A.
    expect((await body(await server.request("POST", "/v1/intent", { token: res.token, body: { type: "upgrade", building: "farm" } }))).ok).toBe(true);
    const later = await body(await server.request("GET", "/v1/state", { token: a.token }));
    expect(later.state.queue.building).toBe("farm");
  });

  test("two guests linking the same Google account at once end up on one account", async () => {
    const a = await newGuest(server);
    const b = await newGuest(server);
    const [ra, rb] = await Promise.all([
      signIn(a.token, await server.idToken("g-1")).then(body),
      signIn(b.token, await server.idToken("g-1")).then(body),
    ]);
    expect(ra.account.id).toBe(rb.account.id);
    expect([ra.switched, rb.switched].filter(Boolean)).toHaveLength(1);
  });
});
