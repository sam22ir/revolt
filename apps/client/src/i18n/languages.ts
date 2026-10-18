export const LANGUAGES = ["en", "fr", "ar"] as const;

export type Language = (typeof LANGUAGES)[number];

const RTL: ReadonlySet<Language> = new Set(["ar"]);

export const isLanguage = (v: unknown): v is Language => LANGUAGES.some((l) => l === v);

export const textDirection = (lang: Language): "rtl" | "ltr" => (RTL.has(lang) ? "rtl" : "ltr");

/** Intl locale used for numbers. Algeria writes Western digits, so Arabic uses `latn`. */
export const numberLocale = (lang: Language): string =>
  lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-US";

/** First of the device languages we support, by prefix; otherwise English (GDD §9). */
export const detectLanguage = (deviceLanguages: readonly string[]): Language => {
  for (const tag of deviceLanguages) {
    const prefix = tag.toLowerCase().split("-")[0];
    if (isLanguage(prefix)) return prefix;
  }
  return "en";
};
