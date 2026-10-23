import { expect } from "vitest";
import type { Env } from "../src/env.ts";
import { startServer, type Server } from "./harness.ts";

/** A soft assertion that names its row: `ex(value)` or `ex(value, "detail")`. */
export type Ex = <T>(value: T, detail?: string) => ReturnType<typeof expect.soft<T>>;
export type RowFn = (server: Server, ex: Ex) => Promise<void>;
export type Rows = Record<string, RowFn>;

/** One scenario can run many rows; give it room on this slow machine. */
export const LONG = 240_000;

const runRow = async (label: string, server: Server, fn: RowFn): Promise<void> => {
  const ex: Ex = (value, detail) => expect.soft(value, detail === undefined ? label : `${label} / ${detail}`);
  try {
    await fn(server, ex);
  } catch (e) {
    // A thrown error fails this row only; the other rows still run.
    expect.soft(e instanceof Error ? (e.stack ?? e.message) : String(e), `${label} (threw)`).toBe("");
  }
};

/** Every row gets its own fresh server: use for anything that depends on accumulated state. */
export const rows = async (env: Partial<Env>, table: Rows): Promise<void> => {
  for (const [label, fn] of Object.entries(table)) {
    const server = await startServer(env);
    try {
      await runRow(label, server, fn);
    } finally {
      await server.dispose();
    }
  }
};
