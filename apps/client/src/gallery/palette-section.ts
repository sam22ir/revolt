import { hex, theme } from "../theme/theme.ts";
import { el, section } from "./dom.ts";
import { themeSwatches } from "./gallery-data.ts";

/** Every colour token in `theme`, with its name and hex value. */
export const paletteSection = (): HTMLElement => {
  const s = section("Palette", "Every token in src/theme/theme.ts. Terrain pairs are light and dark.");
  const row = el("div", "swatches");
  for (const { name, value } of themeSwatches(theme)) {
    const sw = el("div", "swatch");
    const chip = el("div", "chip");
    chip.style.backgroundColor = hex(value);
    sw.append(chip, el("code", "", name), el("span", "dim", hex(value)));
    row.append(sw);
  }
  s.append(row);
  return s;
};
