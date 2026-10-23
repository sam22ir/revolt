// Writes the generated data the Godot client reads: balance tables, display fixtures and .po locales.
// Run: pnpm godot:export. A test in each package fails when the committed files are stale.
// Node strips the TypeScript types on import.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGodotBalance, buildGodotDisplayFixtures, buildGodotMapFixtures } from "../packages/rules/src/export/godot-data.ts";
import { buildPo, PO_LANGUAGES } from "../apps/client/src/i18n/export-po.ts";

const godot = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "godot");

const write = (rel, text) => {
  const path = join(godot, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log("wrote", rel);
};

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

write("data/balance.json", json(buildGodotBalance()));
write("data/display-fixtures.json", json(buildGodotDisplayFixtures()));
write("data/map-fixtures.json", json(buildGodotMapFixtures()));
for (const lang of PO_LANGUAGES) write(`locale/${lang}.po`, buildPo(lang));
