import { RESOURCE_IDS, helpableJob, productionPerHour, storageCap, type BaseState, type ResourceId } from "@revolt/rules";
import { formatAmount, formatDuration } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { el } from "./dom.ts";
import { resourceIcon } from "./icons.ts";

interface Chip {
  readonly li: HTMLElement;
  readonly amount: HTMLElement;
  readonly fill: HTMLElement;
}

export interface Hud {
  readonly root: HTMLElement;
  /** `canAskHelp`: the player is in an alliance and has no open request for the running upgrade. */
  readonly update: (state: BaseState, now: number, canAskHelp?: boolean, multiplier?: number) => void;
  /** A short message under the help button (a refusal), gone after a few seconds. */
  readonly showHelpNote: (text: string) => void;
  readonly setOffline: (offline: boolean) => void;
  /** The view the canvas shows. On the map the idle hint is left to the builders badge on the nav instead. */
  readonly setView: (view: "base" | "map") => void;
}

const NOTE_MS = 4000;

/**
 * `controls` sit on the status row under the resources, at the inline end (none now: the language switch is in the account panel).
 * `nav` is the bottom bar of view buttons (fixed in CSS), `extras` hang on the status row after the queue pill.
 * `attached` hang from the middle of the resources bar (the coordinate tab).
 * `onAskHelp` is the button under the pill that asks the alliance to speed up the running upgrade.
 */
export const createHud = (
  controls: readonly HTMLElement[],
  nav: readonly HTMLElement[],
  extras: readonly HTMLElement[],
  attached: readonly HTMLElement[],
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
    text.append(amount);
    const meter = el("div", "res-meter");
    const fill = el("div", "res-fill");
    meter.append(fill);
    li.append(text, meter);
    list.append(li);
    chips.set(id, { li, amount, fill });
  }
  bar.append(list, ...attached);
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
  let view: "base" | "map" = "base";
  let idle = false;
  const offline = el("p", "sync-offline", t("sync.offline"));
  offline.setAttribute("role", "status");
  offline.dataset.testid = "offline";
  offline.hidden = true;
  const navRow = el("div", "hud-nav");
  navRow.append(...nav);
  root.append(bar, navRow, queue, ...controls, helpBtn, helpNote, ...extras, offline);

  const update = (state: BaseState, now: number, canAskHelp = false, multiplier = 1): void => {
    const lang = currentLanguage();
    const cap = storageCap(state.levels.hq);
    const rate = productionPerHour(state.levels, multiplier);
    for (const id of RESOURCE_IDS) {
      const chip = chips.get(id);
      if (chip === undefined) continue;
      chip.amount.textContent = formatAmount(lang, state.resources[id]);
      // The hourly rate is not shown on the bar (it stays in the building panels); a long press or hover still tells it.
      // LRI…PDI keeps the sign before the number in Arabic ("+100/سا", not "100+").
      chip.li.title = `${t(`resource.${id}`)} · ${t("panel.perHour", { amount: `\u2066+${formatAmount(lang, rate[id])}\u2069` })}`;
      const frac = Math.min(1, state.resources[id] / cap[id]);
      chip.fill.style.inlineSize = `${(frac * 100).toFixed(1)}%`;
      chip.fill.classList.toggle("near", frac >= 0.9);
      chip.fill.classList.toggle("full", frac >= 1);
    }
    const job = state.queue;
    idle = job === null;
    queue.hidden = idle && view === "map";
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

  const setView = (next: "base" | "map"): void => {
    view = next;
    queue.hidden = idle && view === "map";
  };

  const showHelpNote = (text: string): void => {
    helpNote.textContent = text;
    helpNote.hidden = false;
    if (noteTimer !== null) window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => (helpNote.hidden = true), NOTE_MS);
  };

  return { root, update, showHelpNote, setOffline: (v) => (offline.hidden = !v), setView };
};
