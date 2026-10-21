import { EVENTS } from "@revolt/rules";
import { formatAmount, formatDuration } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { LiveStore } from "../state/live-store.ts";
import { eventRemainingMs, nextTierProgress } from "../state/live-view.ts";
import { el } from "./dom.ts";
import { rewardList, reasonLine } from "./live-rewards.ts";

/** The running events (and those just ended with a reward to take), each with the player's score, rank and next tier. */
export const eventsTab = (live: LiveStore, now: number, note: { reason: string | null }, onClaim: (key: string) => void): HTMLElement => {
  const lang = currentLanguage();
  const root = el("div", "live-tab");
  root.dataset.testid = "live-events";
  const data = live.events();
  if (data === null) {
    root.append(el("p", "panel-desc", t(live.offline() ? "live.offlineEmpty" : "live.loading")));
    return root;
  }
  if (data.events.length === 0) root.append(el("p", "panel-desc", t("live.events.none")));
  for (const e of data.events) {
    const card = el("article", "live-card");
    card.dataset.testid = "event-card";
    card.dataset.event = e.id;
    card.dataset.state = e.active ? "active" : "ended";
    const head = el("div", "live-card-head");
    head.append(el("h3", "live-card-title", t(`event.${e.id}.name`)));
    const left = el("span", "live-countdown", "");
    left.dataset.ends = String(e.endsAt);
    left.dataset.label = e.active ? "ends" : "claimBy";
    left.textContent = t(e.active ? "live.events.ends" : "live.events.claimBy", { time: formatDuration(eventRemainingMs(e, now)) });
    head.append(left);
    card.append(head, el("p", "panel-desc", t(`event.${e.id}.desc`)));
    if (e.needsReview) {
      const draft = el("p", "story-draft", t("live.draftNotice"));
      draft.dataset.testid = "event-draft";
      card.append(draft);
    }
    const score = el("p", "live-score");
    score.dataset.testid = "event-score";
    score.append(
      el("span", undefined, t("live.events.score", { score: formatAmount(lang, e.score) })),
      el("span", "live-rank", e.rank === null ? t("live.events.unranked") : t("live.events.rank", { rank: formatAmount(lang, e.rank) })),
    );
    card.append(score);
    const next = nextTierProgress(e);
    if (next !== null) {
      const bar = el("div", "live-meter");
      const fill = el("div", "live-meter-fill");
      fill.style.inlineSize = `${Math.round((100 * next.have) / next.need)}%`;
      bar.append(fill);
      card.append(el("p", "live-next", t("live.events.next", { have: formatAmount(lang, next.have), need: formatAmount(lang, next.need) })), bar);
    } else if (e.tier >= 0) {
      card.append(el("p", "live-next", t("live.events.top")));
    }
    const tier = EVENTS[e.id].tiers[Math.max(0, Math.min(e.tier + (e.claimable || e.claimed ? 0 : 1), EVENTS[e.id].tiers.length - 1))];
    if (tier !== undefined) card.append(el("h4", "panel-sub", t(e.claimable || e.claimed ? "live.events.yourReward" : "live.events.nextReward")), rewardList(tier.reward));
    if (!e.active) {
      const claim = el("button", "upgrade-btn", t(e.claimed ? "live.events.claimed" : "live.events.claim"));
      claim.type = "button";
      claim.dataset.testid = "event-claim";
      claim.disabled = !e.claimable;
      claim.addEventListener("click", () => {
        claim.disabled = true;
        onClaim(e.key);
      });
      card.append(claim);
    }
    root.append(card);
  }
  root.append(el("p", "panel-desc live-hint", t("live.events.howTo")));
  if (note.reason !== null) root.append(reasonLine(note.reason, "live-reason"));
  return root;
};
