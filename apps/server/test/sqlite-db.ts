import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Db, DbStatement } from "../src/db/db.ts";

type Row = Record<string, unknown>;

/** D1 binds booleans as 1/0; node:sqlite refuses them. */
const toSql = (v: unknown): SQLInputValue => (typeof v === "boolean" ? Number(v) : (v as SQLInputValue));

/**
 * Yields to the event loop as a real D1 round trip does, so concurrent requests interleave between
 * queries. Without it, the race tests (e.g. two helpers racing for the last help) never race.
 */
const io = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Our `Db` slice on an in-memory `node:sqlite` database, for tests. Miniflare's D1 takes ~40 ms per
 * query (a round trip to workerd); this takes microseconds. Same SQLite, same error messages.
 * `miniflare-smoke.test.ts` keeps the real D1 path covered.
 */
export const sqliteDb = (): { db: Db; close: () => void } => {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (sql: string, binds: SQLInputValue[]): DbStatement & { exec: () => unknown } => {
    const exec = () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...binds).changes) } });
    return {
      bind: (...values) => statement(sql, values.map(toSql)),
      first: async <T = Row>() => {
        await io();
        const row = sqlite.prepare(sql).get(...binds);
        return (row === undefined ? null : { ...row }) as T | null;
      },
      run: async () => {
        await io();
        return exec();
      },
      all: async <T = Row>() => {
        await io();
        return { results: sqlite.prepare(sql).all(...binds).map((r) => ({ ...r })) as T[] };
      },
      // Used by batch: runs synchronously inside its transaction.
      exec,
    };
  };
  const db: Db = {
    prepare: (sql) => statement(sql, []),
    // D1 runs a batch as one transaction: any failing statement rolls back the whole batch.
    batch: async (stmts) => {
      await io();
      sqlite.exec("BEGIN");
      try {
        const results = stmts.map((s) => (s as ReturnType<typeof statement>).exec());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        // Keep the statement's own error if SQLite already ended the transaction.
        if (sqlite.isTransaction) sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db, close: () => sqlite.close() };
};
