import {
  checkTraining,
  maxTrainingBatch,
  RESOURCE_IDS,
  TROOP_IDS,
  trainingQuote,
  type BaseState,
  type TroopId,
} from "@revolt/rules";
import { formatAmount, formatDuration } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { el } from "./dom.ts";
import { resourceIcon } from "./icons.ts";
import { troopList } from "./troop-format.ts";

export interface TrainingSection {
  readonly root: HTMLElement;
  readonly update: (state: BaseState, now: number) => void;
}

interface TrainingDeps {
  readonly onTrain: (troop: TroopId, count: number) => void;
}

/**
 * The barracks' training form: pick a unit and a count, see cost and time, train.
 * The DOM is built once; `update` only changes text and states, so typing is never interrupted.
 */
export const createTrainingSection = (deps: TrainingDeps): TrainingSection => {
  const root = el("div", "training");
  root.dataset.testid = "training";
  let troop: TroopId = "infantry";
  let count = 1;

  root.append(el("h3", "panel-sub", t("train.title")));

  const home = el("dl", "panel-stats");
  const homeDd = el("dd");
  homeDd.dataset.testid = "troops-home";
  const woundedDd = el("dd");
  woundedDd.dataset.testid = "troops-wounded";
  home.append(el("dt", undefined, t("train.home")), homeDd, el("dt", undefined, t("train.wounded")), woundedDd);

  const batch = el("div", "training-batch");
  batch.dataset.testid = "training-batch";
  const batchLabel = el("p", "panel-sub");
  const batchBar = el("div", "progress");
  const batchFill = el("div", "progress-fill");
  batchBar.append(batchFill);
  const batchTime = el("p", "countdown");
  batch.append(batchLabel, batchBar, batchTime);

  const select = el("select", "troop-select");
  select.dataset.testid = "troop-select";
  select.setAttribute("aria-label", t("train.unit"));
  for (const id of TROOP_IDS) {
    const opt = el("option", undefined, t(`troop.${id}.name`));
    opt.value = id;
    select.append(opt);
  }
  const role = el("p", "panel-desc");

  const input = el("input", "troop-input");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "1";
  input.step = "1";
  input.value = String(count);
  input.dataset.testid = "train-count";
  input.setAttribute("aria-label", t("train.count"));
  const less = el("button", "step-btn", "−");
  less.type = "button";
  less.setAttribute("aria-label", t("panel.less"));
  const more = el("button", "step-btn", "+");
  more.type = "button";
  more.setAttribute("aria-label", t("panel.more"));
  const maxBtn = el("button", "max-btn", t("panel.max"));
  maxBtn.type = "button";
  maxBtn.dataset.testid = "train-max";
  const countRow = el("div", "troop-row");
  const countLabel = el("div", "troop-label");
  const batchLimit = el("span", "troop-home");
  countLabel.append(el("span", "troop-name", t("train.count")), batchLimit);
  countRow.append(countLabel, less, input, more, maxBtn);

  const costs = el("ul", "cost-list");
  costs.setAttribute("aria-label", t("panel.cost"));
  const costChips = new Map(
    RESOURCE_IDS.map((r) => {
      const li = el("li", "cost");
      li.title = t(`resource.${r}`);
      li.innerHTML = resourceIcon(r);
      const value = el("span");
      li.append(value);
      costs.append(li);
      return [r, { li, value }] as const;
    }),
  );
  const meta = el("dl", "panel-stats");
  const timeDd = el("dd");
  timeDd.dataset.testid = "train-time";
  meta.append(el("dt", undefined, t("panel.duration")), timeDd);

  const submit = el("button", "upgrade-btn", t("train.start"));
  submit.type = "button";
  submit.dataset.testid = "train-submit";
  const reason = el("p", "panel-reason");
  reason.dataset.testid = "train-reason";

  root.append(home, batch, select, role, countRow, costs, meta, submit, reason);

  let latest: BaseState | null = null;
  let latestNow = 0;

  const clampCount = (value: number): number => {
    const max = latest === null ? 1 : maxTrainingBatch(latest.levels.barracks);
    return Number.isFinite(value) ? Math.min(max, Math.max(1, Math.floor(value))) : 1;
  };
  const setCount = (value: number): void => {
    count = clampCount(value);
    render();
  };

  select.addEventListener("change", () => {
    const id = TROOP_IDS.find((x) => x === select.value);
    if (id !== undefined) troop = id;
    render();
  });
  input.addEventListener("input", () => {
    // Don't rewrite the field while typing (an empty field is a pause, not a zero).
    if (Number.isFinite(input.valueAsNumber)) count = clampCount(input.valueAsNumber);
    render();
  });
  input.addEventListener("change", () => setCount(input.valueAsNumber));
  less.addEventListener("click", () => setCount(count - 1));
  more.addEventListener("click", () => setCount(count + 1));
  maxBtn.addEventListener("click", () => setCount(latest === null ? 1 : maxTrainingBatch(latest.levels.barracks)));
  submit.addEventListener("click", () => {
    if (latest === null || checkTraining(latest, troop, count) !== null) return;
    deps.onTrain(troop, count);
  });

  const render = (): void => {
    const state = latest;
    if (state === null) return;
    const lang = currentLanguage();
    homeDd.textContent = troopList(state.troops);
    woundedDd.textContent = troopList(state.wounded);

    const job = state.training;
    batch.hidden = job === null;
    if (job !== null) {
      batchLabel.textContent = t("train.inProgress", { count: formatAmount(lang, job.count), troop: t(`troop.${job.troop}.name`) });
      batchTime.textContent = formatDuration(job.endsAt - latestNow);
      const frac = Math.min(1, Math.max(0, (latestNow - job.startedAt) / Math.max(1, job.endsAt - job.startedAt)));
      batchFill.style.inlineSize = `${(frac * 100).toFixed(1)}%`;
    }

    role.textContent = t(`troop.${troop}.desc`);
    select.value = troop;
    const max = maxTrainingBatch(state.levels.barracks);
    if (count > max) count = max;
    if (document.activeElement !== input) input.value = String(count);
    input.max = String(max);
    batchLimit.textContent = t("train.maxBatch", { count: formatAmount(lang, max) });
    less.disabled = count <= 1;
    more.disabled = count >= max;
    maxBtn.disabled = count >= max;

    const quote = trainingQuote(troop, count);
    for (const r of RESOURCE_IDS) {
      const chip = costChips.get(r);
      if (chip === undefined) continue;
      const amount = quote.cost[r];
      chip.li.hidden = amount <= 0;
      chip.li.classList.toggle("lacking", state.resources[r] < amount);
      chip.value.textContent = formatAmount(lang, amount);
    }
    timeDd.textContent = formatDuration(quote.durationMs);

    const blocked = checkTraining(state, troop, count);
    submit.disabled = blocked !== null;
    reason.textContent = blocked === null ? "" : t(`reason.${blocked}`);
    reason.hidden = blocked === null;
  };


  return {
    root,
    update: (state, now) => {
      latest = state;
      latestNow = now;
      render();
    },
  };
};
