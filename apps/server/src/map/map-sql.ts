export type SqlValue = string | number | null;

/**
 * The slice of Durable Object SQLite storage the map uses: synchronous statements
 * returning rows. The DO's `ctx.storage.sql` fits it, and so does `node:sqlite` in tests.
 */
export interface MapSql {
  exec<T = Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): T[];
}
