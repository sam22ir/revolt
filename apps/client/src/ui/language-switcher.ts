import { LANGUAGES, type Language } from "../i18n/languages.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { el } from "./dom.ts";

export const createLanguageSwitcher = (onChange: (lang: Language) => void): HTMLElement => {
  const label = el("label", "lang");
  const select = el("select");
  select.setAttribute("aria-label", t("settings.language"));
  select.dataset.testid = "language";
  for (const lang of LANGUAGES) {
    const opt = el("option", undefined, t(`language.${lang}`));
    opt.value = lang;
    opt.lang = lang;
    select.append(opt);
  }
  select.value = currentLanguage();
  select.addEventListener("change", () => {
    const v = LANGUAGES.find((l) => l === select.value);
    if (v !== undefined) onChange(v);
  });
  label.append(select);
  return label;
};
