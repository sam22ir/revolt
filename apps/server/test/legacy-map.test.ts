import { MAX_NPC_LEVEL, regionsOf } from "@revolt/rules";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import { MapService } from "../src/map/map-service.ts";
import type { MapSql } from "../src/map/map-sql.ts";
import { sqliteDb } from "./sqlite-db.ts";

const T0 = Date.UTC(2026, 9, 1, 12);

describe("a map created before strongholds", () => {
  test("loses its roaming level-4 NPCs, keeps the others, gains one stronghold per region, and a rally on a vanished NPC resolves", async () => {
    const sqlite = new DatabaseSync(":memory:");
    // The schema as it was before `region_id`.
    sqlite.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value)");
    sqlite.exec("CREATE TABLE npcs (id TEXT PRIMARY KEY, level INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, respawn_at INTEGER)");
    sqlite.exec("INSERT INTO meta (key, value) VALUES ('terrain_seed', 42)");
    sqlite.exec("INSERT INTO npcs VALUES ('old-l1', 1, 3, 3, NULL), ('old-l4a', 4, 20, 20, NULL), ('old-l4b', 4, 40, 40, 123)");
    const sql: MapSql = { exec: (q, ...b) => sqlite.prepare(q).all(...b) as never };
    const { db, close } = sqliteDb();
    // Only what the rally's settle reads: the participant's base is gone, so there is nothing to write back.
    await db.prepare("CREATE TABLE bases (account_id TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL)").run();
    let n = 0;
    const service = new MapService({ sql, db, random: () => 0.5, newId: () => `id-${++n}` });

    const rows = sql.exec<{ id: string; level: number; region_id: number | null }>("SELECT id, level, region_id FROM npcs");
    expect(rows.some((r) => r.id === "old-l4a" || r.id === "old-l4b")).toBe(false);
    expect(rows.some((r) => r.id === "old-l1")).toBe(true);
    const strongholds = rows.filter((r) => r.level === MAX_NPC_LEVEL);
    expect(strongholds.map((r) => r.region_id).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(regionsOf(42).map((r) => r.id));

    // A rally that was marching on one of the deleted NPCs: it must resolve (troops home), not crash or liberate.
    sql.exec(
      `INSERT INTO rallies (id, alliance_id, leader_handle, npc_id, npc_level, from_x, from_y, to_x, to_y, gather_until, arrive_at, return_at, seed, status)
       VALUES ('r1', 'al', 'lead', 'old-l4a', 4, 1, 1, 20, 20, ?, ?, ?, 7, 'open')`,
      T0, T0 + 1000, T0 + 2000,
    );
    sql.exec(
      `INSERT INTO marches (id, account_id, npc_id, npc_level, from_x, from_y, to_x, to_y, troops, seed, depart_at, arrive_at, return_at, phase, rally_id)
       VALUES ('m1', 'acc', 'old-l4a', 4, 1, 1, 20, 20, '{}', 0, ?, ?, ?, 'outbound', 'r1')`,
      T0, T0 + 1000, T0 + 2000,
    );
    await service.settle(T0 + 10_000);
    // Fought nothing (the target is gone), came home and was cleaned up: no rally or march row is left behind.
    expect(sql.exec("SELECT 1 FROM rallies")).toEqual([]);
    expect(sql.exec("SELECT 1 FROM marches")).toEqual([]);
    expect(sql.exec("SELECT 1 FROM liberations")).toEqual([]);
    close();
  });
});
