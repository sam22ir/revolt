import { createBaseState } from "@revolt/rules";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { guestRateWindow } from "../src/db/guest-rate.ts";
import { body, newGuest, startServer, T0, type Server } from "./harness.ts";

// The other server tests run on in-process SQLite (see sqlite-db.ts). This file keeps the real D1, in
// workerd, under the same handlers: one Miniflare for the whole file, since each start costs about a second.
let server: Server;
beforeAll(async () => {
  server = await startServer({}, { miniflare: true });
});
afterAll(() => server.dispose());

describe("on Miniflare's D1", () => {
  test("a guest is created and its token reloads the same base", async () => {
    const a = await newGuest(server);
    const b = await body(await server.request("GET", "/v1/state", { token: a.token }));
    expect(b.account.id).toBe(a.res.account.id);
    expect(b.state).toEqual(createBaseState(T0));
  });

  test("a failing statement rolls back the whole batch", async () => {
    const db = server.env.DB;
    await expect(
      db.batch([
        db.prepare("INSERT INTO accounts (id, created_at, handle) VALUES ('smoke', 1, 'smoke')"),
        db.prepare("INSERT INTO batch_assert (ok) VALUES (0)"),
      ]),
    ).rejects.toThrow(/CHECK constraint failed/i);
    expect(await db.prepare("SELECT 1 AS x FROM accounts WHERE id = 'smoke'").first()).toBeNull();
  });

  test("the guest-rate counter statement writes no row once the bucket is full", async () => {
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
});
