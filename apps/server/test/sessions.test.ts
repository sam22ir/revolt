import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { hashToken } from "../src/auth/tokens.ts";
import { body, HOUR, MIN, newGuest, startServer, T0, type Server } from "./harness.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer();
});
afterEach(() => server.dispose());

const lastUsed = async (token: string): Promise<number | null> => {
  const r = await server.env.DB.prepare("SELECT last_used_at FROM sessions WHERE token_hash = ?")
    .bind(await hashToken(token))
    .first<{ last_used_at: number }>();
  return r?.last_used_at ?? null;
};

const lastSeen = async (accountId: string): Promise<number | null> =>
  (await server.env.DB.prepare("SELECT last_seen_at FROM accounts WHERE id = ?").bind(accountId).first<{ last_seen_at: number | null }>())
    ?.last_seen_at ?? null;

const getState = (token: string): Promise<Response> => server.request("GET", "/v1/state", { token });

describe("POST /v1/logout", () => {
  test("ends the session: the token is rejected afterwards", async () => {
    const a = await newGuest(server);
    const res = await server.request("POST", "/v1/logout", { token: a.token });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true, now: T0 });
    expect((await getState(a.token)).status).toBe(401);
    expect(await lastUsed(a.token)).toBeNull();
    expect((await server.request("POST", "/v1/logout", { token: a.token })).status).toBe(401);
  });

  test("other sessions of the same account stay signed in", async () => {
    const a = await newGuest(server);
    await server.request("POST", "/v1/auth/google", { token: a.token, body: { idToken: await server.idToken("g-1") } });
    const b = await newGuest(server);
    const second = await body(await server.request("POST", "/v1/auth/google", { token: b.token, body: { idToken: await server.idToken("g-1") } }));
    await server.request("POST", "/v1/logout", { token: a.token });
    expect((await getState(a.token)).status).toBe(401);
    expect((await getState(second.token)).status).toBe(200);
  });

  test("records when the account was last seen, never moving it backwards", async () => {
    const a = await newGuest(server);
    const id = a.res.account.id as string;
    await server.request("POST", "/v1/auth/google", { token: a.token, body: { idToken: await server.idToken("g-1") } });
    const b = await newGuest(server);
    const second = await body(await server.request("POST", "/v1/auth/google", { token: b.token, body: { idToken: await server.idToken("g-1") } }));
    expect(await lastSeen(id)).toBeNull();
    server.now = T0 + 2 * HOUR;
    await server.request("POST", "/v1/logout", { token: a.token });
    expect(await lastSeen(id)).toBe(T0 + 2 * HOUR);
    server.now = T0 + HOUR;
    await server.request("POST", "/v1/logout", { token: second.token });
    expect(await lastSeen(id)).toBe(T0 + 2 * HOUR);
  });

  test("needs a valid token", async () => {
    expect((await server.request("POST", "/v1/logout")).status).toBe(401);
    expect((await server.request("POST", "/v1/logout", { token: "x".repeat(43) })).status).toBe(401);
  });
});

describe("switching accounts ends the device's old session", () => {
  test("the guest token left behind no longer works", async () => {
    const a = await newGuest(server);
    await server.request("POST", "/v1/auth/google", { token: a.token, body: { idToken: await server.idToken("g-1") } });
    server.now = T0 + MIN;
    const b = await newGuest(server);
    const res = await body(await server.request("POST", "/v1/auth/google", { token: b.token, body: { idToken: await server.idToken("g-1") } }));
    expect(res.switched).toBe(true);
    expect((await getState(b.token)).status).toBe(401);
    expect((await getState(res.token)).status).toBe(200);
    expect(await lastSeen(b.res.account.id)).toBe(T0 + MIN);
  });

  test("linking a guest in place keeps its session", async () => {
    const a = await newGuest(server);
    await server.request("POST", "/v1/auth/google", { token: a.token, body: { idToken: await server.idToken("g-1") } });
    expect((await getState(a.token)).status).toBe(200);
  });
});

describe("sessions.last_used_at", () => {
  test("is not rewritten within the hour", async () => {
    const a = await newGuest(server);
    server.now = T0 + HOUR - 1;
    await getState(a.token);
    expect(await lastUsed(a.token)).toBe(T0);
  });

  test("is refreshed once an hour has passed", async () => {
    const a = await newGuest(server);
    server.now = T0 + HOUR;
    await getState(a.token);
    expect(await lastUsed(a.token)).toBe(T0 + HOUR);
    server.now = T0 + HOUR + 30 * MIN;
    await getState(a.token);
    expect(await lastUsed(a.token)).toBe(T0 + HOUR);
  });

  test("is refreshed by any authenticated route", async () => {
    const a = await newGuest(server);
    server.now = T0 + 2 * HOUR;
    await server.request("POST", "/v1/intent", { token: a.token, body: { type: "upgrade", building: "hq" } });
    expect(await lastUsed(a.token)).toBe(T0 + 2 * HOUR);
  });

  test("never moves backwards when the clock does", async () => {
    const a = await newGuest(server);
    server.now = T0 + 5 * HOUR;
    await getState(a.token);
    server.now = T0 - 10 * HOUR;
    expect((await getState(a.token)).status).toBe(200);
    expect(await lastUsed(a.token)).toBe(T0 + 5 * HOUR);
  });

  test("concurrent requests write it once and all succeed", async () => {
    const a = await newGuest(server);
    server.now = T0 + 3 * HOUR;
    const results = await Promise.all([getState(a.token), getState(a.token), getState(a.token)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await lastUsed(a.token)).toBe(T0 + 3 * HOUR);
  });
});
