import { hex, theme } from "../theme/theme.ts";
import { el } from "./dom.ts";
import { DARK_STAGE, readLang, type GalleryLang } from "./gallery-data.ts";

const LANGS: readonly { readonly lang: GalleryLang; readonly label: string }[] = [
  { lang: "en", label: "English (LTR)" },
  { lang: "ar", label: "Arabic (RTL)" },
];

const BACKGROUNDS: readonly { readonly label: string; readonly value: string }[] = [
  { label: "Dark", value: DARK_STAGE },
  { label: "Ground base", value: hex(theme.ground.base) },
  { label: "World ground", value: hex(theme.ground.world) },
];

/** Sets `lang` and `dir` on the page and mirrors the choice into `?lang=` without a reload. Nothing is stored. */
const applyLang = (lang: GalleryLang): void => {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", lang);
    window.history.replaceState(null, "", url);
  } catch {
    // Some embedded previews refuse history changes; the page still works without the URL.
  }
};

const pressOnly = (buttons: readonly HTMLButtonElement[], active: HTMLButtonElement): void => {
  for (const b of buttons) b.setAttribute("aria-pressed", String(b === active));
};

/** Header: title, language/direction toggle, and the background behind the sprites. */
export const controlsSection = (): HTMLElement => {
  const header = el("header", "controls");
  header.append(el("h1", "", "Style gallery (dev)"));

  const langRow = el("div", "row");
  const langButtons: HTMLButtonElement[] = [];
  const initialLang = readLang(window.location.search);
  for (const { lang, label } of LANGS) {
    const b = el("button", "", label);
    b.type = "button";
    b.addEventListener("click", () => {
      applyLang(lang);
      pressOnly(langButtons, b);
    });
    langButtons.push(b);
    langRow.append(b);
  }
  const activeLang = langButtons[LANGS.findIndex((l) => l.lang === initialLang)];
  if (activeLang !== undefined) pressOnly(langButtons, activeLang);
  applyLang(initialLang);

  const bgRow = el("div", "row");
  const bgButtons: HTMLButtonElement[] = [];
  for (const { label, value } of BACKGROUNDS) {
    const b = el("button", "", label);
    b.type = "button";
    b.addEventListener("click", () => {
      document.documentElement.style.setProperty("--stage-bg", value);
      pressOnly(bgButtons, b);
    });
    bgButtons.push(b);
    bgRow.append(b);
  }
  const first = bgButtons[0];
  if (first !== undefined) pressOnly(bgButtons, first);
  document.documentElement.style.setProperty("--stage-bg", DARK_STAGE);

  header.append(el("p", "note", "Language sets lang and dir, and writes ?lang= to the URL."), langRow);
  header.append(el("p", "note", "Background behind the sprites (not saved):"), bgRow);
  return header;
};
