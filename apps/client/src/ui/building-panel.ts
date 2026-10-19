import {
  BUILDINGS,
  checkUpgrade,
  RESOURCE_IDS,
  storageCap,
  type BaseState,
  type BuildingId,
  type TroopId,
  type UpgradeCheck,
} from "@revolt/rules";
import { formatAmount, formatDuration } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { el } from "./dom.ts";
import { resourceIcon } from "./icons.ts";
import { createTrainingSection } from "./training-section.ts";

export interface BuildingPanel {
  readonly root: HTMLElement;
  readonly show: (id: BuildingId | null) => void;
  readonly selected: () => BuildingId | null;
  /** `canAskTrainingHelp`: the player is in an alliance and has no open request for the running training batch. */
  readonly update: (state: BaseState, now: number, canAskTrainingHelp?: boolean) => void;
  readonly showTrainingHelpNote: (text: string) => void;
}

interface PanelDeps {
  readonly onUpgrade: (id: BuildingId) => void;
  readonly onTrain: (troop: TroopId, count: number) => void;
  readonly onAskTrainingHelp: () => void;
  readonly onClose: () => void;
}

const rateAt = (id: BuildingId, level: number): number => BUILDINGS[id].levels[level - 1]?.ratePerHour ?? 0;

/** Everything shown except the live countdown; the panel is rebuilt when it changes. */
const structureKey = (id: BuildingId, state: BaseState, check: UpgradeCheck): string => {
  const affordable = check.cost === undefined ? "" : RESOURCE_IDS.map((r) => (state.resources[r] >= (check.cost?.[r] ?? 0) ? 1 : 0)).join("");
  const job = state.queue;
  return [currentLanguage(), id, state.levels[id], state.levels.hq, job?.building ?? "-", job?.toLevel ?? "-", check.ok ? "ok" : check.reason, affordable].join("|");
};

export const createBuildingPanel = (deps: PanelDeps): BuildingPanel => {
  const root = el("section", "panel");
  root.dataset.testid = "building-panel";
  root.hidden = true;
  root.setAttribute("aria-live", "polite");
  let current: BuildingId | null = null;
  let key = "";
  let countdown: HTMLElement | null = null;
  let progressFill: HTMLElement | null = null;
  const training = createTrainingSection({ onTrain: deps.onTrain, onAskHelp: deps.onAskTrainingHelp });

  const render = (id: BuildingId, state: BaseState, check: UpgradeCheck): void => {
    const lang = currentLanguage();
    const level = state.levels[id];
    const def = BUILDINGS[id];
    root.replaceChildren();
    root.dataset.building = id;

    const head = el("div", "panel-head");
    const title = el("h2", "panel-title", t(`building.${id}.name`));
    const lvl = el("span", "panel-level", t("panel.level", { level: formatAmount(lang, level) }));
    const close = el("button", "panel-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("panel.close"));
    close.addEventListener("click", deps.onClose);
    head.append(title, lvl, close);

    const desc = el("p", "panel-desc", t(`building.${id}.desc`));

    const stats = el("dl", "panel-stats");
    const addStat = (label: string, value: string, iconHtml?: string): void => {
      const dt = el("dt", undefined, label);
      const dd = el("dd");
      if (iconHtml !== undefined) dd.innerHTML = iconHtml;
      dd.append(el("span", undefined, value));
      stats.append(dt, dd);
    };
    if (def.produces !== null) {
      addStat(
        t("panel.production"),
        t("panel.perHour", { amount: `+${formatAmount(lang, rateAt(id, level))}` }),
        resourceIcon(def.produces),
      );
    }
    if (id === "hq") addStat(t("panel.storage"), formatAmount(lang, storageCap(level).food));

    root.append(head, desc, stats);
    countdown = null;
    progressFill = null;

    const job = state.queue;
    if (job !== null && job.building === id) {
      const box = el("div", "panel-upgrading");
      box.append(el("p", "panel-sub", t("panel.upgrading", { level: formatAmount(lang, job.toLevel) })));
      const bar = el("div", "progress");
      progressFill = el("div", "progress-fill");
      bar.append(progressFill);
      countdown = el("p", "countdown");
      countdown.dataset.testid = "countdown";
      box.append(bar, countdown);
      root.append(box);
      return;
    }

    if (check.toLevel === undefined || check.cost === undefined || check.durationMs === undefined) {
      root.append(el("p", "panel-sub", t("panel.maxLevel")));
      return;
    }

    const next = el("div", "panel-next");
    next.append(el("h3", "panel-sub", t("panel.nextLevel", { level: formatAmount(lang, check.toLevel) })));
    const costs = el("ul", "cost-list");
    costs.setAttribute("aria-label", t("panel.cost"));
    for (const r of RESOURCE_IDS) {
      const amount = check.cost[r];
      if (amount <= 0) continue;
      const li = el("li", state.resources[r] >= amount ? "cost" : "cost lacking");
      li.title = t(`resource.${r}`);
      li.innerHTML = resourceIcon(r);
      li.append(el("span", undefined, formatAmount(lang, amount)));
      costs.append(li);
    }
    const meta = el("dl", "panel-stats");
    meta.append(
      el("dt", undefined, t("panel.duration")),
      el("dd", undefined, formatDuration(check.durationMs)),
    );
    if (def.produces !== null) {
      meta.append(
        el("dt", undefined, t("panel.production")),
        el("dd", undefined, t("panel.perHour", { amount: `+${formatAmount(lang, rateAt(id, check.toLevel))}` })),
      );
    }
    const button = el("button", "upgrade-btn", t("panel.upgrade"));
    button.type = "button";
    button.disabled = !check.ok;
    button.dataset.testid = "upgrade";
    button.addEventListener("click", () => deps.onUpgrade(id));
    next.append(costs, meta, button);
    if (!check.ok) {
      const reason = el("p", "panel-reason", t(`reason.${check.reason}`, { level: formatAmount(lang, check.toLevel) }));
      reason.dataset.testid = "reason";
      next.append(reason);
    }
    root.append(next);
  };

  const update = (state: BaseState, now: number, canAskTrainingHelp = false): void => {
    if (current === null) return;
    const check = checkUpgrade(state, current);
    const k = structureKey(current, state, check);
    if (k !== key) {
      render(current, state, check);
      key = k;
      // Training lives in the barracks' panel; its DOM is kept between rebuilds so typing survives.
      if (current === "barracks") root.append(training.root);
    }
    if (current === "barracks") training.update(state, now, canAskTrainingHelp);
    const job = state.queue;
    if (job !== null && countdown !== null && progressFill !== null) {
      countdown.textContent = formatDuration(job.endsAt - now);
      const frac = Math.min(1, Math.max(0, (now - job.startedAt) / Math.max(1, job.endsAt - job.startedAt)));
      progressFill.style.inlineSize = `${(frac * 100).toFixed(1)}%`;
    }
  };

  return {
    root,
    show: (id) => {
      current = id;
      key = "";
      root.hidden = id === null;
    },
    selected: () => current,
    update,
    showTrainingHelpNote: training.showHelpNote,
  };
};
