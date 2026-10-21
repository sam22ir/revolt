import { heroesFor, RESOURCE_IDS, type Reward } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { activeBackground } from "../state/background.ts";
import { el } from "./dom.ts";
import { resourceIcon } from "./icons.ts";

/** A reward as a row of small items: resource amounts with their icons, then shards, tokens and a cosmetic by name. */
export const rewardList = (reward: Reward): HTMLElement => {
  const lang = currentLanguage();
  const list = el("ul", "cost-list reward-list");
  for (const r of RESOURCE_IDS) {
    const amount = reward.resources?.[r] ?? 0;
    if (amount <= 0) continue;
    const li = el("li", "cost");
    li.title = t(`resource.${r}`);
    li.innerHTML = resourceIcon(r);
    li.append(el("span", undefined, formatAmount(lang, amount)));
    list.append(li);
  }
  const hero = heroesFor(activeBackground())[0];
  if ((reward.shards ?? 0) > 0 && hero !== undefined) {
    list.append(el("li", "cost", t("reward.shards", { count: formatAmount(lang, reward.shards ?? 0), hero: t(`hero.${hero}.name`) })));
  }
  if ((reward.speedupTokens ?? 0) > 0) list.append(el("li", "cost", t("reward.tokens", { count: formatAmount(lang, reward.speedupTokens ?? 0) })));
  if (reward.cosmetic !== undefined) list.append(el("li", "cost", t("reward.cosmetic", { name: t(`cosmetic.${reward.cosmetic}`) })));
  return list;
};

/** A line of small text under a heading, or a refusal from the server. */
export const reasonLine = (reason: string, testid: string): HTMLElement => {
  const p = el("p", "panel-reason", reasonText(reason));
  p.dataset.testid = testid;
  return p;
};

/** Reasons the client invents itself have `live.*` keys; the server's are `reason.*`. */
export const reasonText = (reason: string): string =>
  reason === "billing_unavailable" || reason === "cancelled" || reason === "unreachable" ? t(`live.note.${reason}`) : t(`reason.${reason}`);
