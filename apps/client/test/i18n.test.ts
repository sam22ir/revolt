import {
  BUILDING_IDS,
  MARCH_BLOCK_REASONS,
  MARCH_PHASES,
  MARCH_RESULTS,
  NPC_KINDS,
  RESOURCE_IDS,
  TERRAIN_IDS,
  TRAINING_BLOCK_REASONS,
  TROOP_IDS,
  UPGRADE_BLOCK_REASONS,
} from "@revolt/rules";
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

  test("troops, NPC kinds, terrain, march results and every refusal have keys", () => {
    const all = new Set(keys(en));
    for (const id of TROOP_IDS) {
      expect(all.has(`troop.${id}.name`), id).toBe(true);
      expect(all.has(`troop.${id}.desc`), id).toBe(true);
    }
    for (const kind of NPC_KINDS) {
      expect(all.has(`npc.${kind}.name`), kind).toBe(true);
      expect(all.has(`npc.${kind}.desc`), kind).toBe(true);
    }
    for (const id of TERRAIN_IDS) expect(all.has(`terrain.${id}`), id).toBe(true);
    for (const r of MARCH_RESULTS) expect(all.has(`march.result.${r}`), r).toBe(true);
    for (const r of MARCH_PHASES) expect(all.has(`march.phase.${r}`), r).toBe(true);
    for (const r of [...TRAINING_BLOCK_REASONS, ...MARCH_BLOCK_REASONS, "target_gone", "unreachable"]) {
      expect(all.has(`reason.${r}`), r).toBe(true);
    }
  });

  test("the new names and descriptions are translated, not copied from English", () => {
    const names = keys(en).filter((k) => /^(troop|npc)\./.test(k) || /^terrain\./.test(k));
    const at = (locale: object, k: string): unknown => k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], locale);
    for (const k of names) {
      expect(at(ar, k), `ar:${k}`).not.toBe(at(en, k));
      expect(at(fr, k), `fr:${k}`).not.toBe(at(en, k));
    }
  });

  test("NPC names stay an army or institution, never a people", () => {
    for (const kind of NPC_KINDS) expect(en.npc[kind].name).toMatch(/patrol|convoy|outpost/i);
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
