/**
 * Golden data for the Godot battle-report time (`formatReportTime` in `format.ts`, the short date and time the Phaser report
 * list shows) in English and Arabic (French stays supported but is not fixtured). The text is written in UTC; the Godot side
 * adds the device's offset itself. Some browsers put U+202F before AM/PM, which the bundled font cannot draw, so it is written
 * as a plain space (what Node's Intl gives anyway). Written by `pnpm godot:export` (GODOT_EXPORT=1); otherwise the committed file is
 * compared, so a stale file fails the tests.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { compactJson } from "../../../packages/rules/src/export/compact-json.ts";
import { formatReportTime } from "../src/format.ts";
import { clockTime } from "../src/ui/alliance-rows.ts";
import type { Language } from "../src/i18n/languages.ts";

const godot = (rel: string): URL => new URL(`../../godot/${rel}`, import.meta.url);

/** Instants chosen to hit the edges: midnight and noon (12-hour clock), a single-digit day and month, a century year. */
const INSTANTS = [
  Date.UTC(2026, 9, 24, 16, 5),
  Date.UTC(2026, 0, 3, 0, 0),
  Date.UTC(1999, 11, 31, 23, 59),
  Date.UTC(2026, 6, 14, 12, 0),
  Date.UTC(2031, 2, 9, 9, 30),
];
const LANGS: Language[] = ["en", "ar"];

/** `clockTime` (the time on a chat line) shares the instants; its zone is the process zone, so the test pins it to UTC below. */
const clockCases = (): unknown[] => {
  const zone = process.env.TZ;
  process.env.TZ = "UTC";
  try {
    return LANGS.flatMap((lang) =>
      INSTANTS.map((at) => ({ lang, at, text: clockTime(at, lang).replaceAll("\u202f", " ") })),
    );
  } finally {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
};

const buildFixtures = (): unknown => ({
  clock: clockCases(),
  cases: LANGS.flatMap((lang) =>
    INSTANTS.map((at) => ({ lang, at, text: formatReportTime(lang, at, "UTC").replaceAll("\u202f", " ") })),
  ),
});

describe("Godot report time fixtures", () => {
  test("data/report-time-fixtures.json is up to date (run `pnpm godot:export`)", () => {
    const fixtures = buildFixtures();
    if (process.env.GODOT_EXPORT === "1") {
      writeFileSync(godot("data/report-time-fixtures.json"), `${compactJson(fixtures)}\n`);
      return;
    }
    const committed = JSON.parse(readFileSync(godot("data/report-time-fixtures.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(fixtures)));
  });
});
