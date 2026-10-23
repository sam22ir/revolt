import { expect } from "vitest";

/** One labelled check of a scenario: a table row. */
export type Row = [label: string, run: () => void | Promise<void>];

/**
 * Runs every row of a scenario even if an earlier one fails, and reports each failure with
 * its row label (as a soft assertion), so one broken row never hides the others.
 */
export const rows = async (list: readonly Row[]): Promise<void> => {
  for (const [label, run] of list) {
    try {
      await run();
    } catch (e) {
      expect.soft(false, `row "${label}": ${e instanceof Error ? e.message : String(e)}`).toBe(true);
    }
  }
};
