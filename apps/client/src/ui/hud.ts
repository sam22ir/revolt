import { RESOURCE_IDS, productionPerHour, storageCap, type BaseState, type ResourceId } from "@revolt/rules";
import { formatAmount, formatDuration } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { el } from "./dom.ts";
import { resourceIcon } from "./icons.ts";

interface Chip {
  readonly amount: HTMLElement;
  readonly rate: HTMLElement;
  readonly fill: HTMLElement;
}

export interface Hud {
  readonly root: HTMLElement;
  readonly update: (state: BaseState, now: number) => void;
  readonly setOffline: (offline: boolean) => void;
}

export const createHud = (controls: readonly HTMLElement[]): Hud => {
  const root = el("header", "hud");
  const bar = el("div", "hud-bar");
  const list = el("ul", "hud-resources");
  const chips = new Map<ResourceId, Chip>();
  for (const id of RESOURCE_IDS) {
    const li = el("li", "res");
    li.dataset.resource = id;
    li.title = t(`resource.${id}`);
    li.setAttribute("aria-label", t(`resource.${id}`));
    li.innerHTML = resourceIcon(id);
    const text = el("div", "res-text");
    const amount = el("span", "res-amount");
    const rate = el("span", "res-rate");
    text.append(amount, rate);
    const meter = el("div", "res-meter");
    const fill = el("div", "res-fill");
    meter.append(fill);
    li.append(text, meter);
    list.append(li);
    chips.set(id, { amount, rate, fill });
  }
  bar.append(list, ...controls);
  const queue = el("div", "queue-pill");
  queue.setAttribute("role", "status");
  const queueLabel = el("span", "queue-label");
  const queueTime = el("span", "queue-time");
  queue.append(queueLabel, queueTime);
  const offline = el("p", "sync-offline", t("sync.offline"));
  offline.setAttribute("role", "status");
  offline.dataset.testid = "offline";
  offline.hidden = true;
  root.append(bar, queue, offline);

  const update = (state: BaseState, now: number): void => {
    const lang = currentLanguage();
    const cap = storageCap(state.levels.hq);
    const rate = productionPerHour(state.levels);
    for (const id of RESOURCE_IDS) {
      const chip = chips.get(id);
      if (chip === undefined) continue;
      chip.amount.textContent = formatAmount(lang, state.resources[id]);
      chip.rate.textContent = t("panel.perHour", { amount: `+${formatAmount(lang, rate[id])}` });
      const frac = Math.min(1, state.resources[id] / cap[id]);
      chip.fill.style.inlineSize = `${(frac * 100).toFixed(1)}%`;
      chip.fill.classList.toggle("full", frac >= 1);
    }
    const job = state.queue;
    if (job === null) {
      queueLabel.textContent = t("queue.idle");
      queueTime.textContent = "";
      queue.classList.remove("busy");
    } else {
      const label = t("queue.busy", { building: t(`building.${job.building}.name`), level: formatAmount(lang, job.toLevel) });
      queueLabel.textContent = label;
      queueTime.textContent = formatDuration(job.endsAt - now);
      queue.classList.add("busy");
    }
  };

  return { root, update, setOffline: (v) => (offline.hidden = !v) };
};
