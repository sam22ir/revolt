import { npcLevel, type BaseState, type MarchState } from "@revolt/rules";
import { formatAmount, formatDuration } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { el } from "./dom.ts";

export type MarchStage = "gathering" | "outbound" | "fighting" | "returning";

/**
 * Where a march of the player's base is: waiting for its rally to gather, out, waiting for its battle
 * result, or coming home. A rally's troops leave home when it starts but only march at `departAt`.
 */
export const marchStage = (m: MarchState, now: number): MarchStage => {
  if (m.outcome !== null) return "returning";
  if (m.rallyId !== undefined && now < m.departAt) return "gathering";
  return now < m.arriveAt ? "outbound" : "fighting";
};

export interface MarchesList {
  readonly root: HTMLElement;
  readonly update: (state: BaseState, now: number) => void;
}

interface RowRefs {
  readonly stage: HTMLElement;
  readonly time: HTMLElement;
}

/** The player's marches in the HUD: target, phase and a countdown to arrival or return. */
export const createMarchesList = (): MarchesList => {
  const root = el("ul", "marches");
  root.dataset.testid = "marches";
  root.setAttribute("aria-label", t("march.listTitle"));
  root.hidden = true;
  const rows = new Map<string, RowRefs>();
  let key = "";

  const rebuild = (marches: readonly MarchState[]): void => {
    const lang = currentLanguage();
    root.replaceChildren();
    rows.clear();
    for (const m of marches) {
      const kind = npcLevel(m.target.level)?.kind;
      const name = kind === undefined ? t("march.listTitle") : t(`npc.${kind}.name`);
      const li = el("li", "march-row");
      li.dataset.testid = "march";
      li.dataset.march = m.id;
      const target = el("span", "march-target", t("march.entry", { name, level: formatAmount(lang, m.target.level) }));
      const stage = el("span", "march-stage");
      const time = el("span", "march-time");
      li.append(target, stage, time);
      if (m.heroes !== undefined && m.heroes.length > 0) {
        const led = el("span", "march-heroes", t("march.ledBy", { names: new Intl.ListFormat(currentLanguage(), { style: "narrow", type: "unit" }).format(m.heroes.map((h) => t(`hero.${h.id}.name`))) }));
        led.dataset.testid = "march-heroes";
        li.append(led);
      }
      root.append(li);
      rows.set(m.id, { stage, time });
    }
  };

  return {
    root,
    update: (state, now) => {
      root.hidden = state.marches.length === 0;
      const k = `${currentLanguage()}|${state.marches.map((m) => `${m.id}:${(m.heroes ?? []).map((h) => h.id).join("+")}`).join(",")}`;
      if (k !== key) {
        key = k;
        rebuild(state.marches);
      }
      for (const m of state.marches) {
        const refs = rows.get(m.id);
        if (refs === undefined) continue;
        const stage = marchStage(m, now);
        const row = refs.stage.parentElement;
        if (row !== null) row.dataset.stage = stage;
        // After the battle the result is the news; before it, the leg of the journey.
        refs.stage.textContent = m.outcome === null ? t(`march.phase.${stage}`) : `${t(`march.result.${m.outcome.result}`)} · ${t("march.phase.returning")}`;
        if (stage === "gathering") refs.time.textContent = t("march.departsIn", { time: formatDuration(m.departAt - now) });
        else if (stage === "outbound") refs.time.textContent = t("march.arrivesIn", { time: formatDuration(m.arriveAt - now) });
        else if (stage === "returning") refs.time.textContent = t("march.returnsIn", { time: formatDuration(m.returnAt - now) });
        else refs.time.textContent = "";
      }
    },
  };
};
