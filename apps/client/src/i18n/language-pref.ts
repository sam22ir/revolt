import { isLanguage, type Language } from "./languages.ts";

const KEY = "revolt.lang";

export const loadLanguagePref = (storage: Storage): Language | null => {
  try {
    const v = storage.getItem(KEY);
    return isLanguage(v) ? v : null;
  } catch {
    return null;
  }
};

export const storeLanguagePref = (storage: Storage, lang: Language): void => {
  try {
    storage.setItem(KEY, lang);
  } catch {
    // Not critical: the device language is used next time.
  }
};
