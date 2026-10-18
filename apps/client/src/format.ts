import { numberLocale, type Language } from "./i18n/languages.ts";
import { t } from "./i18n/i18n.ts";

export const formatAmount = (lang: Language, value: number): string =>
  new Intl.NumberFormat(numberLocale(lang), { maximumFractionDigits: 0 }).format(Math.floor(value));

/** Countdown text such as "1 h 5 min" or "42 s". Rounds up so it never shows 0 early. */
export const formatDuration = (ms: number): string => {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  if (total === 0) return t("time.done");
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(t("time.h", { count: h }));
  if (m > 0) parts.push(t("time.m", { count: m }));
  if (s > 0 && h === 0) parts.push(t("time.s", { count: s }));
  return parts.join(" ");
};
