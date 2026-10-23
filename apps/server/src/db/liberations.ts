import type { World } from "@revolt/rules";
import type { Db } from "./db.ts";

/** The regions this server's movement holds or has held, for the production rules. */
export const loadWorld = async (db: Db, server: string): Promise<World> => {
  const { results } = await db
    .prepare("SELECT region, from_at, until_at FROM liberations WHERE server = ?")
    .bind(server)
    .all<{ region: number; from_at: number; until_at: number | null }>();
  return { liberations: results.map((r) => ({ region: r.region, from: r.from_at, until: r.until_at })) };
};

/**
 * Records a liberation unless the region is already held. Idempotent: a retry after a crash
 * (the battle is deterministic, so the map repeats it) changes nothing.
 */
export const openLiberation = (db: Db, server: string, region: number, allianceId: string | null, from: number): Promise<{ meta: { changes: number } }> =>
  db
    .prepare(
      `INSERT INTO liberations (server, region, alliance_id, from_at, until_at)
       SELECT ?, ?, ?, ?, NULL WHERE NOT EXISTS (SELECT 1 FROM liberations WHERE server = ? AND region = ? AND until_at IS NULL)`,
    )
    .bind(server, region, allianceId, from, server, region)
    .run();
