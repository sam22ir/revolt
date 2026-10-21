import { applyThemeToCss } from "../theme/theme.ts";
import { artPackSection } from "./art-pack-section.ts";
import { controlsSection } from "./controls.ts";
import { paletteSection } from "./palette-section.ts";
import { seamSection } from "./seam-section.ts";
import { spritesSection } from "./sprites-section.ts";
import { terrainSection } from "./terrain-section.ts";
import "./gallery.css";

/** Dev-only style gallery (gallery.html). Not in the production build: gallery.html is not a Rollup input. */
applyThemeToCss(document.documentElement);

const root = document.getElementById("gallery");
if (root === null) throw new Error("#gallery missing");
root.append(controlsSection(), paletteSection(), artPackSection(), spritesSection(), terrainSection(), seamSection());
