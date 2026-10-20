import {
  ALLIANCE_ACTIONS,
  ALLIANCE_BLOCK_REASONS,
  ALLIANCE_RANKS,
  BUILDING_IDS,
  HELP_KINDS,
  HERO_BLOCK_REASONS,
  HERO_IDS,
  HERO_RARITIES,
  MARCH_BLOCK_REASONS,
  MARCH_PHASES,
  MARCH_RESULTS,
  NPC_KINDS,
  RESOURCE_IDS,
  SKILL_KINDS,
  STORY,
  STORY_BLOCK_REASONS,
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

  test("alliance ranks, actions, help kinds and every alliance refusal have keys", () => {
    const all = new Set(keys(en));
    for (const rank of ALLIANCE_RANKS) expect(all.has(`alliance.rank.${rank}`), rank).toBe(true);
    for (const action of ALLIANCE_ACTIONS) expect(all.has(`alliance.action.${action}`), action).toBe(true);
    for (const kind of HELP_KINDS) expect(all.has(`help.kind.${kind}`), kind).toBe(true);
    // The two refusals the chat socket can send are shown like any other reason.
    for (const r of [...ALLIANCE_BLOCK_REASONS, "rate_limited", "bad_text"]) expect(all.has(`reason.${r}`), r).toBe(true);
    expect(all.has("march.phase.gathering")).toBe(true);
  });

  test("the new names and descriptions are translated, not copied from English", () => {
    const names = keys(en).filter(
      (k) => /^(troop|npc)\./.test(k) || /^terrain\./.test(k) || /^(alliance\.(tab|rank|action)|help\.kind)\./.test(k) || /^reason\.(already_member|name_taken|alliance_full)$/.test(k),
    );
    const at = (locale: object, k: string): unknown => k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], locale);
    for (const k of names) {
      expect(at(ar, k), `ar:${k}`).not.toBe(at(en, k));
      expect(at(fr, k), `fr:${k}`).not.toBe(at(en, k));
    }
  });

  test("NPC names stay an army or institution, never a people", () => {
    for (const kind of NPC_KINDS) expect(en.npc[kind].name).toMatch(/patrol|convoy|outpost|line/i);
  });
});

describe("heroes and story", () => {
  const at = (locale: object, k: string): unknown => k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], locale);
  const all = new Set(keys(en));
  const OBJECTIVE_KEYS = ["building_level", "troops_owned", "hero_recruited", "hero_recruited_named", "hero_level", "hero_level_named", "victories"];

  test("every hero, rarity, skill kind, hero and story refusal has a key", () => {
    for (const id of HERO_IDS) for (const part of ["name", "role", "desc"]) expect(all.has(`hero.${id}.${part}`), `${id}.${part}`).toBe(true);
    for (const r of HERO_RARITIES) expect(all.has(`rarity.${r}`), r).toBe(true);
    for (const k of SKILL_KINDS) expect(all.has(`hero.skill.${k}`), k).toBe(true);
    for (const r of [...HERO_BLOCK_REASONS, ...STORY_BLOCK_REASONS]) expect(all.has(`reason.${r}`), r).toBe(true);
    expect(all.has("building.hero_hall.name")).toBe(true);
    for (const k of OBJECTIVE_KEYS) expect(all.has(`story.objective.${k}`), k).toBe(true);
  });

  test("every chapter has a title and all its scenes", () => {
    for (const [bg, chapters] of Object.entries(STORY)) {
      for (const c of chapters) {
        expect(all.has(`story.${bg}.${c.id}.title`), `${bg}.${c.id}.title`).toBe(true);
        for (let n = 1; n <= c.scenes; n++) expect(all.has(`story.${bg}.${c.id}.scene${n}`), `${bg}.${c.id}.scene${n}`).toBe(true);
      }
    }
  });

  test("no story text exists that the chapter data does not use, so nothing unreviewed slips in", () => {
    const used = new Set<string>();
    for (const [bg, chapters] of Object.entries(STORY)) {
      for (const c of chapters) {
        used.add(`story.${bg}.${c.id}.title`);
        for (let n = 1; n <= c.scenes; n++) used.add(`story.${bg}.${c.id}.scene${n}`);
      }
    }
    for (const k of keys(en).filter((x) => /^story\.algeria\./.test(x))) expect(used.has(k), k).toBe(true);
  });

  test("all chapter text is marked as a draft in every language, until a chapter is reviewed", () => {
    const TITLE = { en: "[Draft]", fr: "[Brouillon]", ar: "[مسودة]" } as const;
    const SCENE = { en: "[Draft, needs historian review]", fr: "[Brouillon, relecture d’historien requise]", ar: "[مسودة، تحتاج مراجعة مؤرخ]" } as const;
    for (const [lang, locale] of Object.entries(LOCALES) as [keyof typeof TITLE, object][]) {
      for (const [bg, chapters] of Object.entries(STORY)) {
        for (const c of chapters) {
          if (c.reviewed) continue;
          expect(String(at(locale, `story.${bg}.${c.id}.title`)).startsWith(TITLE[lang]), `${lang}:${c.id}.title`).toBe(true);
          for (let n = 1; n <= c.scenes; n++) expect(String(at(locale, `story.${bg}.${c.id}.scene${n}`)).startsWith(SCENE[lang]), `${lang}:${c.id}.scene${n}`).toBe(true);
        }
      }
    }
    expect(en.story.draftNotice).toMatch(/historian review/i);
  });

  test("hero names and chapter text are translated, not copied from English", () => {
    const names = [...HERO_IDS.map((id) => `hero.${id}.name`), ...HERO_IDS.map((id) => `hero.${id}.role`), "story.algeria.ch1.scene1", "heroes.title", "story.title", "building.hero_hall.name"];
    for (const k of names) {
      expect(at(ar, k), `ar:${k}`).not.toBe(at(en, k));
      expect(at(fr, k), `fr:${k}`).not.toBe(at(en, k));
    }
  });

  test("heroes are roles, not named people", () => {
    for (const id of HERO_IDS) expect(en.hero[id].desc).toMatch(/inspired by/i);
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
