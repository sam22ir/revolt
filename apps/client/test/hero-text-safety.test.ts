import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/*
 * Hero and story text is all from i18n keys, but the panels must still set it as text, never as markup, so a
 * future text (a translated string with `<`, a hero name from data) cannot become HTML. The only `innerHTML`
 * allowed is the static resource icon.
 */
const FILES = ["heroes-panel.ts", "story-panel.ts", "march-dialog.ts", "marches-list.ts", "reports-panel.ts"];
const read = (f: string): string => readFileSync(join(import.meta.dirname, "..", "src", "ui", f), "utf8");

describe("hero and story panels set text, not markup", () => {
  test("innerHTML, insertAdjacentHTML and outerHTML are only used for the static resource icon", () => {
    for (const f of FILES) {
      const src = read(f);
      for (const line of src.split("\n")) {
        if (/insertAdjacentHTML|outerHTML|document\.write/.test(line)) throw new Error(`${f}: ${line.trim()}`);
        if (/innerHTML\s*=/.test(line)) expect(line, `${f}: ${line.trim()}`).toMatch(/resourceIcon\(/);
      }
    }
  });

  test("the story panel always shows the draft notice and the chapter text comes from i18n keys", () => {
    const src = read("story-panel.ts");
    expect(src).toContain('t("story.draftNotice")');
    expect(src).toMatch(/t\(`story\.\$\{DEFAULT_BACKGROUND\}\.\$\{chapter\.id\}\.scene/);
  });

  test("player-visible hero text in the panels never comes from state strings", () => {
    // The only text from state is numbers; names are looked up by id through t().
    const src = read("heroes-panel.ts");
    expect(src).not.toMatch(/textContent\s*=\s*(card|state)\.[a-z]+\.(name|title)/);
    expect(src).toContain("t(`hero.${card.id}.name`)");
  });
});
