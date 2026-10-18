/**
 * The slice of D1 the server uses. Both the Workers binding and Miniflare's
 * D1 satisfy it, so handlers stay free of runtime-specific types.
 */
export interface DbStatement {
  bind(...values: unknown[]): DbStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface Db {
  prepare(sql: string): DbStatement;
  batch(statements: DbStatement[]): Promise<unknown[]>;
}

/** D1 surfaces constraint violations as errors whose message names the constraint. */
export const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Error && /UNIQUE constraint failed/i.test(e.message);
