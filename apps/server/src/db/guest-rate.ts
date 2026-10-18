import type { Db } from "./db.ts";

export const GUEST_RATE_WINDOW_MS = 60 * 60 * 1000;

export const guestRateWindow = (now: number): number => Math.floor(now / GUEST_RATE_WINDOW_MS) * GUEST_RATE_WINDOW_MS;

/**
 * Counts one guest creation for `bucket` in the hour containing `now`, unless the
 * bucket already reached `limit`. One atomic statement; a refused request writes nothing.
 */
export const takeGuestSlot = async (db: Db, bucket: string, now: number, limit: number): Promise<boolean> => {
  const r = await db
    .prepare(
      `INSERT INTO guest_rate (bucket, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (bucket, window_start) DO UPDATE SET count = count + 1 WHERE count < ?
       RETURNING count`,
    )
    .bind(bucket, guestRateWindow(now), limit)
    .first<{ count: number }>();
  return r !== null;
};

/** Removes counters for windows that ended before `now`'s window. */
export const deleteOldGuestRate = async (db: Db, now: number): Promise<number> => {
  const r = await db.prepare("DELETE FROM guest_rate WHERE window_start < ?").bind(guestRateWindow(now)).run();
  return r.meta.changes;
};
