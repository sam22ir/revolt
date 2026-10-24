/**
 * Golden data for the Godot port of the barracks training rules (`packages/rules/src/training.ts`: the batch limit, the quote and
 * the check) and of the troop list (`troop-format.ts`) in English and Arabic (French stays supported but is not fixtured).
 * Written by `pnpm godot:export` (GODOT_EXPORT=1); otherwise the committed file is compared, so a stale file fails the tests.
 *
 * Every troop is tier 1 in the data, so the "barracks below the troop's tier" reason cannot come from real data; the Godot
 * side keeps that check and tests it with a synthetic tier in its own tests.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  checkTraining,
  maxTrainingBatch,
  RESOURCE_IDS,
  TRAINING_BATCH_PER_LEVEL,
  TROOP_IDS,
  trainingQuote,
  type BaseState,
  type Resources,
  type TroopId,
} from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { compactJson } from "../../../packages/rules/src/export/compact-json.ts";
import { changeLanguage, initI18n } from "../src/i18n/i18n.ts";
import type { Language } from "../src/i18n/languages.ts";
import { troopList } from "../src/ui/troop-format.ts";

const godot = (rel: string): URL => new URL(`../../godot/${rel}`, import.meta.url);

const BARRACKS_LEVELS = [1, 2, 3, 5];
const LANGS: Language[] = ["en", "ar"];

/** The state fields the training check reads (the rest of a base is not used by it). */
const stateOf = (barracks: number, busy: boolean, resources: Resources): BaseState =>
  ({
    levels: { barracks },
    resources,
    training: busy ? { troop: "heavy", count: 1, startedAt: 0, endsAt: 1 } : null,
  }) as unknown as BaseState;

const counts = (max: number): number[] => [0, -1, 1.5, 1, 7, max, max + 1];

/** The resources of one scenario: rich, exactly the cost, or the cost with one positive resource one short. */
const scenarios = (cost: Resources): { name: string; resources: Resources }[] => {
  const out = [{ name: "exact", resources: { ...cost } }];
  for (const id of RESOURCE_IDS) {
    if (cost[id] > 0) out.push({ name: `short-${id}`, resources: { ...cost, [id]: cost[id] - 1 } });
  }
  return out;
};

const buildChecks = (): unknown[] => {
  const rows: unknown[] = [];
  for (const barracks of BARRACKS_LEVELS) {
    const max = maxTrainingBatch(barracks);
    for (const troop of TROOP_IDS as readonly TroopId[]) {
      for (const count of counts(max)) {
        const cost = trainingQuote(troop, Number.isInteger(count) && count > 0 ? count : 1).cost;
        // A rich state with a busy barracks shows the busy reason, a rich free one shows the count reason or nothing.
        const rich = { food: 1e9, materiel: 1e9, funds: 1e9, support: 1e9 };
        rows.push({ barracks, busy: true, troop, count, scenario: "rich", resources: rich, reason: reasonOf(barracks, true, troop, count, rich) });
        for (const s of scenarios(cost)) {
          rows.push({ barracks, busy: false, troop, count, scenario: s.name, resources: s.resources, reason: reasonOf(barracks, false, troop, count, s.resources) });
        }
      }
    }
  }
  return rows;
};

const reasonOf = (barracks: number, busy: boolean, troop: TroopId, count: number, resources: Resources): string =>
  checkTraining(stateOf(barracks, busy, resources), troop, count) ?? "";

const buildQuotes = (): unknown[] =>
  (TROOP_IDS as readonly TroopId[]).flatMap((troop) =>
    [1, 7, maxTrainingBatch(5)].map((count) => {
      const q = trainingQuote(troop, count);
      return { troop, count, cost: q.cost, durationMs: q.durationMs };
    }),
  );

const TROOP_CASES: Record<string, number>[] = [
  { infantry: 0, scouts: 0, heavy: 0, porters: 0 },
  { infantry: 4, scouts: 3, heavy: 0, porters: 0 },
  { infantry: 1, scouts: 0, heavy: 0, porters: 12345 },
  { infantry: 10, scouts: 20, heavy: 30, porters: 40 },
];

const buildTroopList = async (): Promise<Record<Language, string[]>> => {
  const out = {} as Record<Language, string[]>;
  for (const lang of LANGS) {
    await changeLanguage(lang);
    out[lang] = TROOP_CASES.map((troops) => troopList(troops as never));
  }
  await changeLanguage("en");
  return out;
};

const fixtures = async () => ({
  batchPerLevel: TRAINING_BATCH_PER_LEVEL,
  maxBatch: BARRACKS_LEVELS.map((b) => [b, maxTrainingBatch(b)]),
  quotes: buildQuotes(),
  checks: buildChecks(),
  troopCases: TROOP_CASES,
  troopList: await buildTroopList(),
});

describe("Godot training fixtures", () => {
  test("data/training-fixtures.json is up to date (run `pnpm godot:export`)", async () => {
    // i18n writes the language to the page; there is no page here (as in the base fixtures).
    Object.defineProperty(globalThis, "document", { value: { documentElement: {}, title: "" }, configurable: true });
    await initI18n("en");
    const built = await fixtures();
    if (process.env.GODOT_EXPORT === "1") {
      writeFileSync(godot("data/training-fixtures.json"), `${compactJson(built)}\n`);
      return;
    }
    const committed = JSON.parse(readFileSync(godot("data/training-fixtures.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(built)));
  });
});
