import type { RallyView } from "@revolt/rules";
import { formatAmount, formatDuration } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { userText } from "./alliance-rows.ts";
import { el } from "./dom.ts";

export interface AllianceRallies {
  readonly root: HTMLElement;
  readonly update: (rallies: readonly RallyView[], now: number) => void;
}

interface RalliesDeps {
  /** Opens the troop picker for this rally. */
  readonly onJoin: (rally: RallyView) => void;
}

/** A rally can be joined while it gathers and while it has room. */
export const canJoinRally = (r: RallyView, now: number): boolean => !r.joined && now < r.gatherUntil && r.participants < r.maxParticipants;

const rowKey = (r: RallyView, now: number): string =>
  `${r.id}:${r.joined ? 1 : 0}:${r.participants}:${now < r.gatherUntil ? 1 : 0}:${canJoinRally(r, now) ? 1 : 0}`;

/** The alliance's rallies: leader, target, gathering countdown, participants, and Join while it is open. */
export const createAllianceRallies = ({ onJoin }: RalliesDeps): AllianceRallies => {
  const root = el("div", "alliance-rallies");
  const empty = el("p", "panel-desc", t("rally.empty"));
  const list = el("ul", "rally-list");
  list.dataset.testid = "rallies";
  list.setAttribute("aria-label", t("rally.list"));
  root.append(list, empty);
  const timers = new Map<string, { el: HTMLElement; r: RallyView }>();
  let key = "";

  const rebuild = (rallies: readonly RallyView[], now: number): void => {
    const lang = currentLanguage();
    list.replaceChildren();
    timers.clear();
    for (const r of rallies) {
      const li = el("li", "rally-row");
      li.dataset.testid = "rally";
      li.dataset.id = r.id;
      li.dataset.npc = r.target.npcId;
      li.dataset.joined = r.joined ? "1" : "0";
      const text = el("div", "rally-text");
      const target = el("strong", "rally-target", t("march.entry", { name: t(`npc.${r.target.kind}.name`), level: formatAmount(lang, r.target.level) }));
      const leader = el("span", "rally-leader");
      leader.append(`${t("rally.led")} `, userText("bdi", r.leader, "member-handle"));
      const time = el("span", "rally-time");
      timers.set(r.id, { el: time, r });
      const people = el("span", "rally-people", t("rally.participants", { count: formatAmount(lang, r.participants), max: formatAmount(lang, r.maxParticipants) }));
      text.append(target, leader, time, people);
      li.append(text);
      if (r.joined) li.append(el("span", "help-note", t("rally.joined")));
      else if (canJoinRally(r, now)) {
        const join = el("button", "small-btn primary", t("rally.join"));
        join.type = "button";
        join.dataset.testid = "rally-join";
        join.addEventListener("click", () => onJoin(r));
        li.append(join);
      }
      list.append(li);
    }
  };

  return {
    root,
    update: (rallies, now) => {
      empty.hidden = rallies.length > 0;
      const k = `${currentLanguage()}|${rallies.map((r) => rowKey(r, now)).join(",")}`;
      if (k !== key) {
        key = k;
        rebuild(rallies, now);
      }
      for (const { el: node, r } of timers.values()) {
        node.textContent = now < r.gatherUntil ? t("rally.gathering", { time: formatDuration(r.gatherUntil - now) }) : t("rally.marching");
      }
    },
  };
};
