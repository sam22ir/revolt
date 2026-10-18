import { BUILDING_IDS, RESOURCE_IDS, UPGRADE_BLOCK_REASONS } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { detectLanguage, LANGUAGES, textDirection } from "../src/i18n/languages.ts";
import { ar } from "../src/i18n/locales/ar.ts";
import { en } from "../src/i18n/locales/en.ts";
import { fr } from "../src/i18n/locales/fr.ts";

const keys = (obj: object, prefix = ""): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

const LOCALES = { en, fr, ar };

describe("locales", () => {
  test("en, fr and ar have identical key sets", () => {
    const enKeys = keys(en).sort();
    expect(keys(fr).sort()).toEqual(enKeys);
    expect(keys(ar).sort()).toEqual(enKeys);
  });

  test("every value is a non-empty string", () => {
    for (const [lang, locale] of Object.entries(LOCALES)) {
      for (const k of keys(locale)) {
        const v = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], locale);
        expect(typeof v === "string" && v.trim().length > 0, `${lang}:${k}`).toBe(true);
      }
    }
  });

  test("every mechanical id and block reason has a key", () => {
    const all = new Set(keys(en));
    for (const id of RESOURCE_IDS) expect(all.has(`resource.${id}`), id).toBe(true);
    for (const id of BUILDING_IDS) {
      expect(all.has(`building.${id}.name`), id).toBe(true);
      expect(all.has(`building.${id}.desc`), id).toBe(true);
    }
    for (const r of UPGRADE_BLOCK_REASONS) expect(all.has(`reason.${r}`), r).toBe(true);
    for (const l of LANGUAGES) expect(all.has(`language.${l}`), l).toBe(true);
  });
});

describe("language detection", () => {
  test("follows the first supported device language", () => {
    expect(detectLanguage(["ar-DZ", "fr-FR"])).toBe("ar");
    expect(detectLanguage(["de-DE", "fr-CA"])).toBe("fr");
    expect(detectLanguage(["EN-gb"])).toBe("en");
  });

  test("falls back to English", () => {
    expect(detectLanguage(["vi-VN"])).toBe("en");
    expect(detectLanguage([])).toBe("en");
  });

  test("Arabic is right-to-left", () => {
    expect(textDirection("ar")).toBe("rtl");
    expect(textDirection("fr")).toBe("ltr");
  });
});
