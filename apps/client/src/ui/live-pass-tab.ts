import { PASS_TIER_COUNT, PASS_TIERS, PASS_XP_PER_TIER, type PassTrack } from "@revolt/rules";
import { formatAmount, formatDuration } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { LiveStore } from "../state/live-store.ts";
import { passTierStates } from "../state/live-view.ts";
import { el } from "./dom.ts";
import { reasonLine, rewardList } from "./live-rewards.ts";

/** The season's pass: a ladder of tiers, a free row and a premium row each, with what can be claimed marked. */
export const passTab = (live: LiveStore, now: number, note: { reason: string | null }, onClaim: (tier: number, track: PassTrack) => void, onUnlock: () => void): HTMLElement => {
  const lang = currentLanguage();
  const root = el("div", "live-tab");
  root.dataset.testid = "live-pass";
  const pass = live.pass();
  if (pass === null) {
    root.append(el("p", "panel-desc", t(live.offline() ? "live.offlineEmpty" : "live.loading")));
    return root;
  }
  const season = el("p", "panel-desc live-countdown");
  season.dataset.ends = String(pass.endsAt);
  season.dataset.label = "season";
  season.textContent = t("live.pass.season", { time: formatDuration(Math.max(0, pass.endsAt - now)) });
  const into = pass.xp - Math.min(pass.tier, PASS_TIER_COUNT) * PASS_XP_PER_TIER;
  const progress = el("p", "live-score");
  progress.dataset.testid = "pass-progress";
  progress.append(
    el("span", undefined, t("live.pass.tier", { tier: formatAmount(lang, pass.tier), total: formatAmount(lang, PASS_TIER_COUNT) })),
    el("span", "live-rank", pass.tier >= PASS_TIER_COUNT ? t("live.pass.max") : t("live.pass.xp", { have: formatAmount(lang, into), need: formatAmount(lang, PASS_XP_PER_TIER) })),
  );
  root.append(season, progress);

  if (!pass.premium) {
    const unlock = el("button", "secondary-btn", t("live.pass.unlock"));
    unlock.type = "button";
    unlock.dataset.testid = "pass-unlock";
    unlock.addEventListener("click", onUnlock);
    root.append(el("p", "panel-desc", t("live.pass.premiumHint")), unlock);
  } else {
    root.append(el("p", "live-owned", t("live.pass.unlocked")));
  }

  const ladder = el("ol", "pass-ladder");
  for (const s of passTierStates(pass)) {
    const def = PASS_TIERS[s.tier - 1];
    if (def === undefined) continue;
    const li = el("li", "pass-tier");
    li.dataset.testid = `pass-tier-${s.tier}`;
    li.append(el("span", "pass-tier-n", formatAmount(lang, s.tier)));
    for (const track of ["free", "premium"] as const) {
      const state = s[track];
      const cell = el("div", `pass-cell ${track}`);
      cell.dataset.state = state;
      cell.append(el("span", "pass-track", t(`live.pass.${track}`)), rewardList(track === "free" ? def.free : def.premium));
      const btn = el("button", "secondary-btn pass-claim", t(state === "claimed" ? "live.pass.claimed" : state === "claimable" ? "live.pass.claim" : "live.pass.locked"));
      btn.type = "button";
      btn.dataset.testid = `pass-claim-${s.tier}-${track}`;
      btn.disabled = state !== "claimable";
      btn.addEventListener("click", () => {
        btn.disabled = true;
        onClaim(s.tier, track);
      });
      cell.append(btn);
      li.append(cell);
    }
    ladder.append(li);
  }
  root.append(ladder);
  if (note.reason !== null) root.append(reasonLine(note.reason, "live-reason"));
  root.append(el("p", "panel-desc live-hint", t("live.pass.fairNote")));
  return root;
};
