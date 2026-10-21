import type { BackgroundId } from "@revolt/rules";
import i18next from "i18next";
import { activeBackground } from "../state/background.ts";
import { bgKeys } from "./bg-keys.ts";
import { isLanguage, textDirection, type Language } from "./languages.ts";
import { ar } from "./locales/ar.ts";
import { en } from "./locales/en.ts";
import { fr } from "./locales/fr.ts";

export const LOCALES = { en, fr, ar } as const;

export const initI18n = async (lang: Language): Promise<void> => {
  await i18next.init({
    lng: lang,
    fallbackLng: false,
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      ar: { translation: ar },
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  applyDocumentLanguage(lang);
};

export const changeLanguage = async (lang: Language): Promise<void> => {
  await i18next.changeLanguage(lang);
  applyDocumentLanguage(lang);
};

const applyDocumentLanguage = (lang: Language): void => {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = textDirection(lang);
  document.title = i18next.t("app.title");
};

/** Translates `key`, preferring the player's background-specific text when there is some (see `bgKey`). */
export const t = (key: string, options?: Record<string, unknown>): string => i18next.t(bgKeys(activeBackground(), key), options);


export const currentLanguage = (): Language => {
  const lang = i18next.language;
  return isLanguage(lang) ? lang : "en";
};
