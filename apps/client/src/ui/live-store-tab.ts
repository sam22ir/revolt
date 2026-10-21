import { COSMETIC_SLOTS, PRODUCTS, slotOf, type BaseState, type CosmeticId, type CosmeticSlot, type ProductSku } from "@revolt/rules";
import { formatAmount, formatDuration } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { numberLocale } from "../i18n/languages.ts";
import type { LiveStore } from "../state/live-store.ts";
import { priceHint, speedUpAllowance } from "../state/live-view.ts";
import { el } from "./dom.ts";
import { reasonLine, rewardList } from "./live-rewards.ts";

interface StoreActions {
  readonly buy: (sku: ProductSku) => void;
  readonly equip: (slot: CosmeticSlot, cosmetic: CosmeticId | null) => void;
  readonly speedUp: (job: "upgrade" | "training") => void;
}

/**
 * The store. No countdowns or fake scarcity: every product is always on offer at the same price hint. A fair-play
 * note says what money cannot buy (GDD §8). With no billing in this build, buying is off and the page says so.
 */
export const storeTab = (live: LiveStore, state: BaseState, note: { reason: string | null }, actions: StoreActions): HTMLElement => {
  const lang = currentLanguage();
  const root = el("div", "live-tab");
  root.dataset.testid = "live-store";
  const fair = el("p", "live-fair", t("live.store.fairNote"));
  fair.dataset.testid = "store-fairnote";
  fair.setAttribute("role", "note");
  root.append(fair);
  const store = live.store();
  if (store === null) {
    root.append(el("p", "panel-desc", t(live.offline() ? "live.offlineEmpty" : "live.loading")));
    return root;
  }
  const canBuy = live.billing.available && store.canRedeem;
  if (!canBuy) {
    const off = el("p", "panel-reason", t("live.store.unavailable"));
    off.dataset.testid = "store-unavailable";
    root.append(off);
  }

  // Speed-ups: what is held, what the day still allows, and the two jobs they can shorten.
  const allow = speedUpAllowance(store.wallet);
  root.append(el("h3", "panel-sub", t("live.store.speedups")));
  const wallet = el("p", "live-score");
  wallet.dataset.testid = "store-wallet";
  wallet.append(
    el("span", undefined, t("live.store.tokens", { count: formatAmount(lang, store.wallet.speedupTokens) })),
    el("span", "live-rank", t("live.store.dailyLeft", { time: formatDuration(allow.ms) })),
  );
  root.append(wallet, el("p", "panel-desc", t("live.store.speedupRule")));
  const row = el("div", "live-actions");
  for (const job of ["upgrade", "training"] as const) {
    const running = job === "upgrade" ? state.queue : state.training;
    const btn = el("button", "secondary-btn", t(`live.store.useOn.${job}`));
    btn.type = "button";
    btn.dataset.testid = `speedup-${job}`;
    btn.disabled = running === null || store.wallet.speedupTokens < 1 || allow.ms <= 0 || (job === "upgrade" && state.queue?.building === "hq");
    btn.addEventListener("click", () => {
      btn.disabled = true;
      actions.speedUp(job);
    });
    row.append(btn);
  }
  root.append(row);

  root.append(el("h3", "panel-sub", t("live.store.products")));
  const list = el("ul", "store-list");
  for (const p of store.products) {
    const def = PRODUCTS[p.sku];
    const li = el("li", "store-item");
    li.dataset.testid = `store-product-${p.sku}`;
    li.dataset.owned = String(p.owned);
    const head = el("div", "live-card-head");
    head.append(el("h4", "live-card-title", t(`product.${p.sku}.name`)), el("span", "live-price", priceHint(numberLocale(lang), p.priceHintUsdCents)));
    li.append(head, el("p", "panel-desc", t(`product.${p.sku}.desc`, { count: formatAmount(lang, def.grants.speedupTokens ?? 0) })), rewardList(def.grants));
    const buy = el("button", "upgrade-btn", t(p.owned ? "live.store.owned" : "live.store.buy"));
    buy.type = "button";
    buy.dataset.testid = `store-buy-${p.sku}`;
    buy.disabled = !canBuy || p.owned;
    buy.addEventListener("click", () => {
      buy.disabled = true;
      actions.buy(p.sku);
    });
    li.append(buy);
    list.append(li);
  }
  root.append(list);

  root.append(el("h3", "panel-sub", t("live.store.wardrobe")));
  if (store.cosmetics.owned.length === 0) root.append(el("p", "panel-desc", t("live.store.noCosmetics")));
  for (const slot of COSMETIC_SLOTS) {
    const owned = store.cosmetics.owned.filter((c) => slotOf(c) === slot);
    if (owned.length === 0) continue;
    const worn = store.cosmetics.equipped[slot];
    const group = el("div", "wardrobe-slot");
    group.append(el("h4", "panel-sub", t(`live.slot.${slot}`)));
    for (const c of owned) {
      const on = worn === c;
      const b = el("button", on ? "secondary-btn worn" : "secondary-btn", `${t(`cosmetic.${c}`)}${on ? ` · ${t("live.store.worn")}` : ""}`);
      b.type = "button";
      b.dataset.testid = `equip-${c}`;
      b.addEventListener("click", () => actions.equip(slot, on ? null : c));
      group.append(b);
    }
    root.append(group);
  }
  if (note.reason !== null) root.append(reasonLine(note.reason, "live-reason"));
  return root;
};
