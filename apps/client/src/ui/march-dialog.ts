import {
  npcLevel,
  RALLY_GATHER_OPTIONS_MS,
  rallyTiming,
  TROOP_IDS,
  ZERO_TROOPS,
  type BaseState,
  type HeroId,
  type HeroLoadout,
  type MapNpcView,
  type MapSnapshot,
  type RallyView,
  type TroopId,
  type Troops,
} from "@revolt/rules";
import { formatAmount, formatDuration } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { MarchOutcome } from "../state/game-store.ts";
import { activeBackground } from "../state/background.ts";
import { availableHeroes, bonusSummary } from "../state/hero-view.ts";
import { ownBase, previewMarch } from "../state/tile-info.ts";
import { el } from "./dom.ts";
import { troopIcon } from "./icons.ts";
import { troopList } from "./troop-format.ts";

/** What the troops are picked for: a solo march, a rally the player starts, or one that is gathering. */
export type MarchMode =
  | { readonly kind: "march" }
  | { readonly kind: "rally_start" }
  | { readonly kind: "rally_join"; readonly rally: RallyView };

export interface MarchDialog {
  readonly root: HTMLElement;
  readonly open: (npc: MapNpcView, mode?: MarchMode) => void;
  readonly close: () => void;
  readonly isOpen: () => boolean;
  readonly update: (state: BaseState, snapshot: MapSnapshot | null) => void;
}

interface MarchDialogDeps {
  readonly onSend: (npcId: string, troops: Troops, heroes: HeroLoadout | null) => Promise<MarchOutcome>;
  readonly onRallyStart: (npcId: string, troops: Troops, gatherMs: number) => Promise<MarchOutcome>;
  readonly onRallyJoin: (rallyId: string, troops: Troops) => Promise<MarchOutcome>;
  /** Called after the dialog closes by itself (sent, cancelled). */
  readonly onClosed: () => void;
}

interface Row {
  readonly input: HTMLInputElement;
  readonly home: HTMLElement;
  readonly minus: HTMLButtonElement;
  readonly plus: HTMLButtonElement;
  readonly maxBtn: HTMLButtonElement;
}

const stepButton = (label: string, glyph: string, testid: string): HTMLButtonElement => {
  const b = el("button", "step-btn", glyph);
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.dataset.testid = testid;
  return b;
};

/**
 * Pick how many of each troop to send at an NPC target, alone or for an alliance rally. Local rules
 * (`checkMarch`) decide whether Send is enabled; the server's refusal, if any, is shown under it.
 */
export const createMarchDialog = (deps: MarchDialogDeps): MarchDialog => {
  const root = el("div", "dialog-backdrop");
  root.hidden = true;
  root.dataset.testid = "march-dialog";
  let target: MapNpcView | null = null;
  let mode: MarchMode = { kind: "march" };
  let gather: HTMLSelectElement | null = null;
  let counts: Record<TroopId, number> = { ...ZERO_TROOPS };
  let rows = new Map<TroopId, Row>();
  let sending = false;
  /** Lead first, then two deputies; "" is an empty slot. */
  let picks: (HeroId | "")[] = ["", "", ""];
  let heroSelects: HTMLSelectElement[] = [];
  let heroBonus: HTMLElement;
  let heroKey = "";
  let serverReason: string | null = null;
  let travel: HTMLElement;
  let carry: HTMLElement;
  let reason: HTMLElement;
  let submit: HTMLButtonElement;
  let latest: { state: BaseState; snapshot: MapSnapshot | null } | null = null;

  const close = (): void => {
    root.hidden = true;
    target = null;
    root.replaceChildren();
    deps.onClosed();
  };

  const home = (state: BaseState, id: TroopId): number => state.troops[id];

  const chosen = (): HeroId[] => picks.filter((p): p is HeroId => p !== "");
  /** The first pick leads, the rest are deputies. Rallies take no heroes. */
  const loadout = (): HeroLoadout | null => {
    const ids = chosen();
    const [lead, ...deputies] = ids;
    return lead === undefined ? null : { lead, deputies };
  };

  /** Fills the hero pickers from the heroes that are free right now; a pick that is no longer free is dropped. */
  const refreshHeroes = (state: BaseState): void => {
    const free = availableHeroes(state, activeBackground());
    picks = picks.map((p) => (p !== "" && free.includes(p) ? p : ""));
    const k = [currentLanguage(), free.join(","), picks.join(",")].join("|");
    if (k === heroKey) return;
    heroKey = k;
    heroSelects.forEach((select, slot) => {
      select.replaceChildren();
      const none = el("option", undefined, t("march.heroNone"));
      none.value = "";
      select.append(none);
      for (const id of free) {
        const opt = el("option", undefined, `${t(`hero.${id}.name`)} · ${t("panel.level", { level: formatAmount(currentLanguage(), state.heroes.owned[id]?.level ?? 1) })}`);
        opt.value = id;
        // A hero can fill one slot only.
        opt.disabled = picks.some((p, i) => p === id && i !== slot);
        select.append(opt);
      }
      select.value = picks[slot] ?? "";
      select.disabled = free.length === 0;
    });
  };

  const setCount = (id: TroopId, value: number): void => {
    const max = latest === null ? 0 : home(latest.state, id);
    const next = Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : 0;
    if (next !== counts[id]) serverReason = null;
    counts = { ...counts, [id]: next };
    refresh();
  };

  const refresh = (): void => {
    if (latest === null || target === null) return;
    const lang = currentLanguage();
    const { state, snapshot } = latest;
    const from = ownBase(snapshot);
    for (const id of TROOP_IDS) {
      const row = rows.get(id);
      if (row === undefined) continue;
      const max = home(state, id);
      // The troops at home can shrink under us (a batch, a returning march); never keep more than exists.
      if (counts[id] > max) counts = { ...counts, [id]: max };
      row.home.textContent = t("march.atHome", { count: formatAmount(lang, max) });
      row.input.max = String(max);
      if (document.activeElement !== row.input) row.input.value = String(counts[id]);
      row.minus.disabled = counts[id] <= 0;
      row.plus.disabled = counts[id] >= max;
      row.maxBtn.disabled = counts[id] >= max;
    }
    if (from === null) {
      travel.textContent = "—";
      carry.textContent = "—";
      reason.textContent = t("map.loading");
      submit.disabled = true;
      return;
    }
    refreshHeroes(state);
    const squad = mode.kind === "march" ? loadout() : null;
    const preview = previewMarch(state, from, target, counts, squad);
    const bonus = bonusSummary(state, squad);
    heroBonus.hidden = squad === null;
    heroBonus.textContent = t("march.heroBonus", { attack: formatAmount(lang, bonus.attack), defense: formatAmount(lang, bonus.defense) });
    // A rally marches at its own fixed speed, whatever troops are in it.
    const legMs = preview.travelMs === null || mode.kind === "march" ? preview.travelMs : rallyTiming(from, target, 0).arriveAt;
    travel.textContent = legMs === null ? "—" : formatDuration(legMs);
    carry.textContent = formatAmount(lang, preview.carry);
    const key = serverReason ?? preview.reason;
    reason.textContent = key === null ? "" : t(`reason.${key}`);
    reason.dataset.reason = key ?? "";
    submit.disabled = sending || preview.reason !== null;
  };

  const sendLabel = (m: MarchMode): string => t(m.kind === "march" ? "march.send" : m.kind === "rally_start" ? "rally.start" : "rally.join");

  const dispatch = (npc: MapNpcView, m: MarchMode): Promise<MarchOutcome> => {
    if (m.kind === "rally_join") return deps.onRallyJoin(m.rally.id, counts);
    if (m.kind === "rally_start") return deps.onRallyStart(npc.id, counts, Number(gather?.value ?? RALLY_GATHER_OPTIONS_MS[0]));
    return deps.onSend(npc.id, counts, loadout());
  };

  const send = async (): Promise<void> => {
    if (target === null || sending) return;
    sending = true;
    submit.textContent = t("march.sending");
    refresh();
    const outcome = await dispatch(target, mode);
    sending = false;
    submit.textContent = sendLabel(mode);
    if (outcome.ok) {
      close();
      return;
    }
    serverReason = outcome.reason;
    refresh();
  };

  const open = (npc: MapNpcView, nextMode: MarchMode = { kind: "march" }): void => {
    const lang = currentLanguage();
    target = npc;
    mode = nextMode;
    gather = null;
    counts = { ...ZERO_TROOPS };
    serverReason = null;
    sending = false;
    rows = new Map();
    picks = ["", "", ""];
    heroKey = "";

    const box = el("section", "dialog");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    const head = el("div", "panel-head");
    head.append(el("h2", "panel-title", t(mode.kind === "march" ? "march.title" : mode.kind === "rally_start" ? "rally.startTitle" : "rally.joinTitle")));
    const x = el("button", "panel-close", "×");
    x.type = "button";
    x.setAttribute("aria-label", t("panel.close"));
    x.addEventListener("click", close);
    head.append(x);

    const targetLine = el("p", "panel-desc", `${t(`npc.${npc.kind}.name`)} · ${t("panel.level", { level: formatAmount(lang, npc.level) })}`);
    targetLine.dataset.testid = "march-target";
    box.append(head, targetLine);

    if (mode.kind === "rally_start") {
      const field = el("label", "rally-gather-field");
      field.append(el("span", undefined, t("rally.gatherTime")));
      const select = el("select", "troop-select");
      select.dataset.testid = "rally-gather";
      for (const ms of RALLY_GATHER_OPTIONS_MS) {
        const opt = el("option", undefined, formatDuration(ms));
        opt.value = String(ms);
        select.append(opt);
      }
      gather = select;
      field.append(select);
      box.append(field);
    }

    const list = el("ul", "troop-rows");
    for (const id of TROOP_IDS) {
      const li = el("li", "troop-row");
      li.dataset.troop = id;
      const icon = el("span", "troop-role-icon");
      icon.append(troopIcon(id));
      const label = el("div", "troop-label");
      label.append(el("span", "troop-name", t(`troop.${id}.name`)));
      const homeText = el("span", "troop-home");
      label.append(homeText);
      const input = el("input", "troop-input");
      input.type = "number";
      input.inputMode = "numeric";
      input.min = "0";
      input.step = "1";
      input.value = "0";
      input.setAttribute("aria-label", t("march.amount", { troop: t(`troop.${id}.name`) }));
      input.dataset.testid = `march-count-${id}`;
      input.addEventListener("input", () => setCount(id, input.valueAsNumber));
      input.addEventListener("change", () => {
        setCount(id, input.valueAsNumber);
        input.value = String(counts[id]);
      });
      const minus = stepButton(t("panel.less"), "−", `march-less-${id}`);
      const plus = stepButton(t("panel.more"), "+", `march-more-${id}`);
      minus.addEventListener("click", () => setCount(id, counts[id] - 1));
      plus.addEventListener("click", () => setCount(id, counts[id] + 1));
      const maxBtn = el("button", "max-btn", t("panel.max"));
      maxBtn.type = "button";
      maxBtn.dataset.testid = `march-max-${id}`;
      maxBtn.addEventListener("click", () => setCount(id, latest === null ? 0 : home(latest.state, id)));
      li.append(icon, label, minus, input, plus, maxBtn);
      list.append(li);
      rows.set(id, { input, home: homeText, minus, plus, maxBtn });
    }

    const heroBox = el("section", "hero-pick");
    heroBox.dataset.testid = "march-heroes";
    heroBox.append(el("h3", "panel-sub", t("march.heroes")));
    heroSelects = [0, 1, 2].map((slot) => {
      const field = el("label", "hero-pick-field");
      field.append(el("span", undefined, slot === 0 ? t("march.heroLead") : t("march.heroDeputy", { n: formatAmount(lang, slot) })));
      const select = el("select", "troop-select");
      select.dataset.testid = `march-hero-${slot}`;
      select.addEventListener("change", () => {
        picks = picks.map((p, i) => (i === slot ? (select.value as HeroId | "") : p));
        serverReason = null;
        heroKey = "";
        refresh();
      });
      field.append(select);
      heroBox.append(field);
      return select;
    });
    heroBonus = el("p", "hero-bonus");
    heroBonus.dataset.testid = "march-hero-bonus";
    heroBonus.hidden = true;
    heroBox.append(heroBonus);

    const stats = el("dl", "panel-stats march-stats");
    travel = el("dd");
    travel.dataset.testid = "march-travel";
    carry = el("dd");
    carry.dataset.testid = "march-carry";
    stats.append(el("dt", undefined, t("march.travel")), travel, el("dt", undefined, t("march.carry")), carry);
    const def = npcLevel(npc.level);
    if (def !== null) stats.prepend(el("dt", undefined, t("map.defenders")), el("dd", undefined, troopList(def.defenders)));

    reason = el("p", "panel-reason");
    reason.dataset.testid = "march-reason";
    reason.setAttribute("role", "status");
    submit = el("button", "upgrade-btn", sendLabel(mode));
    submit.type = "button";
    submit.dataset.testid = "march-submit";
    submit.addEventListener("click", () => void send());
    const cancel = el("button", "secondary-btn", t("march.cancel"));
    cancel.type = "button";
    cancel.dataset.testid = "march-cancel";
    cancel.addEventListener("click", close);

    box.append(list, heroBox, stats, reason, submit, cancel);
    root.replaceChildren(box);
    root.hidden = false;
    refresh();
  };

  return {
    root,
    open,
    close,
    isOpen: () => target !== null,
    update: (state, snapshot) => {
      latest = { state, snapshot };
      refresh();
    },
  };
};

