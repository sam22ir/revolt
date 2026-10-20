import { RESOURCE_IDS, TROOP_IDS, type BattleReport, type Troops } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { numberLocale } from "../i18n/languages.ts";
import { el } from "./dom.ts";
import { resourceIcon } from "./icons.ts";

export interface ReportsPanel {
  readonly root: HTMLElement;
  readonly toggle: (open?: boolean) => void;
  /** Opens the list (if closed) on one report. */
  readonly showReport: (id: string) => void;
  readonly isOpen: () => boolean;
  readonly update: (reports: readonly BattleReport[]) => void;
}

interface ReportsDeps {
  readonly onOpen: () => void;
  readonly onClose: () => void;
}

const when = (at: number): string =>
  new Intl.DateTimeFormat(numberLocale(currentLanguage()), { dateStyle: "short", timeStyle: "short" }).format(new Date(at));

const targetName = (r: BattleReport): string => (r.target.kind === null ? t("report.targetGone") : t(`npc.${r.target.kind}.name`));


/** A table with one row per unit type that appears in `columns` (any non-zero count in `used`). */
const troopTable = (used: readonly Troops[], heads: readonly string[], columns: readonly Troops[]): HTMLElement => {
  const lang = currentLanguage();
  const table = el("table", "report-table");
  const thead = el("thead");
  const headRow = el("tr");
  headRow.append(el("th", undefined, t("report.unit")), ...heads.map((h) => el("th", undefined, h)));
  thead.append(headRow);
  const tbody = el("tbody");
  for (const id of TROOP_IDS) {
    if (!used.some((u) => u[id] > 0)) continue;
    const row = el("tr");
    row.dataset.troop = id;
    row.append(el("th", undefined, t(`troop.${id}.name`)), ...columns.map((c) => el("td", undefined, formatAmount(lang, c[id]))));
    tbody.append(row);
  }
  table.append(thead, tbody);
  return table;
};

const renderDetail = (r: BattleReport): HTMLElement => {
  const lang = currentLanguage();
  const box = el("article", "report");
  box.dataset.testid = "report";
  box.dataset.result = r.result;
  box.dataset.reportId = r.id;
  const result = el("h3", `report-result result-${r.result}`, t(`march.result.${r.result}`));
  result.dataset.testid = "report-result";
  const target = el("p", "panel-desc", `${targetName(r)}${r.target.kind === null ? "" : ` · ${t("panel.level", { level: formatAmount(lang, r.target.level) })}`} · ${t("map.coords", { x: formatAmount(lang, r.target.x), y: formatAmount(lang, r.target.y) })}`);
  target.dataset.testid = "report-target";
  box.append(result, target, el("p", "report-when", when(r.at)));

  if (r.result === "target_gone") {
    box.append(el("p", "panel-sub", t("report.targetGone")));
    return box;
  }

  const mine = el("section", "report-section");
  mine.append(
    troopTable([r.sent], [t("report.sent"), t("report.survivors"), t("report.wounded"), t("report.lost")], [r.sent, r.survivors, r.wounded, r.lost]),
  );
  const theirs = el("section", "report-section");
  theirs.append(el("h4", "panel-sub", t("report.defenders")), troopTable([r.defenders], [t("report.defenders"), t("report.defendersKilled")], [r.defenders, r.defendersKilled]));
  if (r.heroes !== undefined && r.heroes.length > 0) {
    const heroes = el("section", "report-section report-heroes");
    heroes.dataset.testid = "report-heroes";
    heroes.append(el("h4", "panel-sub", t("report.heroes")));
    const names = el("ul", "report-hero-list");
    for (const h of r.heroes) {
      names.append(el("li", undefined, t("report.heroEntry", { name: t(`hero.${h.id}.name`), level: formatAmount(lang, h.level) })));
    }
    heroes.append(names);
    box.append(heroes);
  }
  box.append(mine, theirs, el("p", "report-rounds", t("report.rounds", { count: formatAmount(lang, r.rounds) })));

  const loot = el("div", "report-loot");
  loot.dataset.testid = "report-loot";
  loot.append(el("h4", "panel-sub", t("report.loot")));
  const chips = el("ul", "cost-list");
  for (const id of RESOURCE_IDS) {
    if (r.loot[id] <= 0) continue;
    const li = el("li", "cost");
    li.title = t(`resource.${id}`);
    li.innerHTML = resourceIcon(id);
    li.append(el("span", undefined, formatAmount(lang, r.loot[id])));
    chips.append(li);
  }
  loot.append(chips.childElementCount === 0 ? el("p", "panel-desc", t("report.noLoot")) : chips);
  box.append(loot);
  return box;
};

/** The list of battle reports and, one tap away, a full report. */
export const createReportsPanel = (deps: ReportsDeps): ReportsPanel => {
  const root = el("section", "panel reports-panel");
  root.hidden = true;
  root.dataset.testid = "reports";
  root.setAttribute("aria-live", "polite");
  let reports: readonly BattleReport[] = [];
  let openId: string | null = null;

  const render = (): void => {
    root.replaceChildren();
    const head = el("div", "panel-head");
    head.append(el("h2", "panel-title", t("report.title")));
    const close = el("button", "panel-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("panel.close"));
    close.addEventListener("click", () => toggle(false));
    head.append(close);
    root.append(head);

    const report = openId === null ? undefined : reports.find((r) => r.id === openId);
    if (report !== undefined) {
      const back = el("button", "secondary-btn", t("report.back"));
      back.type = "button";
      back.dataset.testid = "report-back";
      back.addEventListener("click", () => {
        openId = null;
        render();
      });
      root.append(back, renderDetail(report));
      return;
    }
    openId = null;
    if (reports.length === 0) {
      root.append(el("p", "panel-desc", t("report.empty")));
      return;
    }
    const lang = currentLanguage();
    const list = el("ul", "report-list");
    for (const r of reports) {
      const li = el("li");
      const btn = el("button", `report-row result-${r.result}`);
      btn.type = "button";
      btn.dataset.testid = "report-open";
      btn.dataset.reportId = r.id;
      btn.append(
        el("span", "report-row-result", t(`march.result.${r.result}`)),
        el("span", "report-row-target", r.target.kind === null ? targetName(r) : `${targetName(r)} · ${t("panel.level", { level: formatAmount(lang, r.target.level) })}`),
        el("span", "report-row-when", when(r.at)),
      );
      btn.addEventListener("click", () => {
        openId = r.id;
        render();
      });
      li.append(btn);
      list.append(li);
    }
    root.append(list);
  };

  const toggle = (open = root.hidden): void => {
    if (open === !root.hidden) return;
    root.hidden = !open;
    if (open) {
      deps.onOpen();
      render();
    } else {
      openId = null;
      deps.onClose();
    }
  };

  return {
    root,
    toggle,
    showReport: (id) => {
      openId = id;
      if (root.hidden) toggle(true);
      else render();
    },
    isOpen: () => !root.hidden,
    update: (next) => {
      reports = next;
      if (!root.hidden) render();
    },
  };
};
