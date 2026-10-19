import { RESOURCE_IDS, helpableJob, productionPerHour, storageCap, type BaseState, type ResourceId } from "@revolt/rules";
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
  /** `canAskHelp`: the player is in an alliance and has no open request for the running upgrade. */
  readonly update: (state: BaseState, now: number, canAskHelp?: boolean) => void;
  /** A short message under the help button (a refusal), gone after a few seconds. */
  readonly showHelpNote: (text: string) => void;
  readonly setOffline: (offline: boolean) => void;
}

const NOTE_MS = 4000;

/**
 * `controls` sit beside the resources, `nav` is the row of view buttons below them, `extras` hang under the queue pill.
 * `onAskHelp` is the button under the pill that asks the alliance to speed up the running upgrade.
 */
export const createHud = (
  controls: readonly HTMLElement[],
  nav: readonly HTMLElement[],
  extras: readonly HTMLElement[],
  onAskHelp: () => void,
): Hud => {
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
  // The pill ignores taps (it floats over the map), so the button is a sibling.
  const helpBtn = el("button", "help-btn", t("help.ask"));
  helpBtn.type = "button";
  helpBtn.hidden = true;
  helpBtn.dataset.testid = "help-ask";
  helpBtn.dataset.kind = "upgrade";
  helpBtn.addEventListener("click", onAskHelp);
  const helpNote = el("p", "help-note-line");
  helpNote.setAttribute("role", "status");
  helpNote.dataset.testid = "help-ask-error";
  helpNote.hidden = true;
  let noteTimer: number | null = null;
  const offline = el("p", "sync-offline", t("sync.offline"));
  offline.setAttribute("role", "status");
  offline.dataset.testid = "offline";
  offline.hidden = true;
  const navRow = el("div", "hud-nav");
  navRow.append(...nav);
  root.append(bar, navRow, queue, helpBtn, helpNote, ...extras, offline);

  const update = (state: BaseState, now: number, canAskHelp = false): void => {
    const lang = currentLanguage();
    const cap = storageCap(state.levels.hq);
    const rate = productionPerHour(state.levels);
    for (const id of RESOURCE_IDS) {
      const chip = chips.get(id);
      if (chip === undefined) continue;
      chip.amount.textContent = formatAmount(lang, state.resources[id]);
      // LRI…PDI keeps the sign before the number in Arabic ("+100/سا", not "100+").
      chip.rate.textContent = t("panel.perHour", { amount: `\u2066+${formatAmount(lang, rate[id])}\u2069` });
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
    helpBtn.hidden = !(canAskHelp && helpableJob(state, "upgrade", now) !== null);
  };

  const showHelpNote = (text: string): void => {
    helpNote.textContent = text;
    helpNote.hidden = false;
    if (noteTimer !== null) window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => (helpNote.hidden = true), NOTE_MS);
  };

  return { root, update, showHelpNote, setOffline: (v) => (offline.hidden = !v) };
};
