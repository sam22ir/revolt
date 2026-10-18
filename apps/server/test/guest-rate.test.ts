import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ipBucket } from "../src/client-ip.ts";
import { deleteOldGuestRate, guestRateWindow } from "../src/db/guest-rate.ts";
import { body, HOUR, startServer, T0, type Server } from "./harness.ts";

const LIMIT = 3;
let server: Server;
beforeEach(async () => {
  server = await startServer({ GUEST_LIMIT_PER_HOUR: String(LIMIT) });
});
afterEach(() => server.dispose());

const guest = (ip?: string): Promise<Response> => server.request("POST", "/v1/guest", ip === undefined ? {} : { ip });

const rows = async (): Promise<number> =>
  (await server.env.DB.prepare("SELECT COUNT(*) AS n FROM guest_rate").first<{ n: number }>())?.n ?? 0;

describe("guest creation is rate-limited per client IP", () => {
  test("the limit is allowed, the next one gets 429 rate_limited", async () => {
    for (let i = 0; i < LIMIT; i++) expect((await guest("203.0.113.7")).status).toBe(201);
    const res = await guest("203.0.113.7");
    expect(res.status).toBe(429);
    expect(await body(res)).toEqual({ error: "rate_limited" });
  });

  test("a refused request creates no account", async () => {
    for (let i = 0; i <= LIMIT; i++) await guest("203.0.113.7");
    const n = await server.env.DB.prepare("SELECT COUNT(*) AS n FROM accounts").first<{ n: number }>();
    expect(n?.n).toBe(LIMIT);
  });

  test("the counter statement writes no row once the bucket is full", async () => {
    // Same SQL as takeGuestSlot, run with .run() to read D1's row-write metering.
    const sql = `INSERT INTO guest_rate (bucket, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (bucket, window_start) DO UPDATE SET count = count + 1 WHERE count < ?
       RETURNING count`;
    const take = async (): Promise<number> => {
      const r = await server.env.DB.prepare(sql).bind("b", guestRateWindow(T0), 2).run();
      // Our Db slice only types `changes`; D1 and Miniflare also report `rows_written`.
      return (r.meta as { rows_written?: number }).rows_written ?? -1;
    };
    expect(await take()).toBeGreaterThan(0);
    expect(await take()).toBeGreaterThan(0);
    expect(await take()).toBe(0);
  });

  test("the limit is checked before the body is read", async () => {
    for (let i = 0; i < LIMIT; i++) await guest("203.0.113.7");
    expect((await server.request("POST", "/v1/guest", { ip: "203.0.113.7", raw: "x".repeat(20_000) })).status).toBe(429);
  });

  test("other IPs are counted separately", async () => {
    for (let i = 0; i < LIMIT; i++) await guest("203.0.113.7");
    expect((await guest("203.0.113.7")).status).toBe(429);
    expect((await guest("198.51.100.1")).status).toBe(201);
  });

  test("one IPv6 /64 is one bucket", async () => {
    for (let i = 0; i < LIMIT; i++) expect((await guest(`2001:db8:1:2::${i + 1}`)).status).toBe(201);
    expect((await guest("2001:db8:1:2:ffff:ffff:ffff:ffff")).status).toBe(429);
    expect((await guest("2001:db8:1:3::1")).status).toBe(201);
  });

  test("requests without a client IP share one bucket", async () => {
    for (let i = 0; i < LIMIT; i++) expect((await guest()).status).toBe(201);
    expect((await guest()).status).toBe(429);
  });

  test("the next hour's window allows guests again", async () => {
    for (let i = 0; i < LIMIT; i++) await guest("203.0.113.7");
    server.now = T0 + HOUR - 1;
    expect((await guest("203.0.113.7")).status).toBe(429);
    server.now = T0 + HOUR;
    expect((await guest("203.0.113.7")).status).toBe(201);
  });

  test("the clock going backwards neither crashes nor lifts a full window", async () => {
    server.now = T0 + HOUR;
    for (let i = 0; i < LIMIT; i++) await guest("203.0.113.7");
    server.now = T0;
    expect((await guest("203.0.113.7")).status).toBe(201); // an earlier, empty window
    server.now = T0 + HOUR + 1;
    expect((await guest("203.0.113.7")).status).toBe(429);
  });

  test("the IP is never stored in clear", async () => {
    await guest("203.0.113.7");
    const r = await server.env.DB.prepare("SELECT bucket FROM guest_rate").first<{ bucket: string }>();
    expect(r?.bucket).toMatch(/^[0-9a-f]{64}$/);
  });

  test("old windows are deleted, the current one is kept", async () => {
    await guest("203.0.113.7");
    server.now = T0 + HOUR;
    await guest("203.0.113.7");
    expect(await rows()).toBe(2);
    expect(await deleteOldGuestRate(server.env.DB, server.now)).toBe(1);
    expect(await rows()).toBe(1);
  });

  test("an invalid configured limit falls back to the default", async () => {
    const s = await startServer({ GUEST_LIMIT_PER_HOUR: "nope" });
    for (let i = 0; i < 5; i++) expect((await s.request("POST", "/v1/guest", { ip: "203.0.113.7" })).status).toBe(201);
    await s.dispose();
  });
});

describe("ipBucket", () => {
  const req = (ip?: string): Request => new Request("http://api.test/", ip === undefined ? {} : { headers: { "cf-connecting-ip": ip } });

  test("IPv4 is the address, IPv6 is its /64", () => {
    expect(ipBucket(req("203.0.113.7"))).toBe("203.0.113.7");
    expect(ipBucket(req("2001:0db8:0001:0002:0003:0004:0005:0006"))).toBe("2001:db8:1:2::/64");
    expect(ipBucket(req("2001:DB8:1:2::9"))).toBe("2001:db8:1:2::/64");
    expect(ipBucket(req("2001:db8::1"))).toBe("2001:db8:0:0::/64");
    expect(ipBucket(req("::1"))).toBe("0:0:0:0::/64");
    expect(ipBucket(req())).toBe("unknown");
  });
});
