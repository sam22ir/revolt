import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildPo, flattenLocale, PO_LANGUAGES, toGodotPlaceholders } from "../src/i18n/export-po.ts";
import { en } from "../src/i18n/locales/en.ts";

const committed = (lang: string): string =>
  readFileSync(new URL(`../../godot/locale/${lang}.po`, import.meta.url), "utf8");

describe("Godot locales", () => {
  test.each(PO_LANGUAGES)("%s.po is up to date (run `pnpm godot:export`)", (lang) => {
    expect(committed(lang)).toBe(buildPo(lang));
  });

  test("placeholders become Godot's {name}", () => {
    expect(toGodotPlaceholders("k", "Level {{level}} of {{max}}")).toBe("Level {level} of {max}");
  });

  test("unsupported i18next syntax fails the export", () => {
    expect(() => toGodotPlaceholders("k", "{{count, number}}")).toThrow();
    expect(() => toGodotPlaceholders("k", "see $t(other.key)")).toThrow();
  });

  test("every key is exported", () => {
    expect(flattenLocale(en).length).toBeGreaterThan(400);
    for (const [key] of flattenLocale(en)) expect(committed("en")).toContain(`msgid "${key}"`);
  });
});
