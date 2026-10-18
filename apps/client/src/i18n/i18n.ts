import i18next from "i18next";
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

export const t = (key: string, options?: Record<string, unknown>): string => i18next.t(key, options);

export const currentLanguage = (): Language => {
  const lang = i18next.language;
  return isLanguage(lang) ? lang : "en";
};
