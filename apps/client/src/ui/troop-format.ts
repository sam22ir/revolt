import { TROOP_IDS, type Troops } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { numberLocale } from "../i18n/languages.ts";

/** "4 Infantry, 3 Scouts", in the active language; the "none" label when there are no troops. */
export const troopList = (troops: Troops): string => {
  const lang = currentLanguage();
  const parts = TROOP_IDS.filter((id) => troops[id] > 0).map((id) => `${formatAmount(lang, troops[id])} ${t(`troop.${id}.name`)}`);
  if (parts.length === 0) return t("train.none");
  return new Intl.ListFormat(numberLocale(lang), { style: "narrow", type: "unit" }).format(parts);
};
