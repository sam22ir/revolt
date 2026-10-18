import type { BattleReport } from "@revolt/rules";
import { t } from "../i18n/i18n.ts";
import { el } from "./dom.ts";

export interface ReportToast {
  readonly root: HTMLElement;
  readonly show: (report: BattleReport) => void;
  readonly hide: () => void;
}

/** How long a new-report notice stays before it fades (the report stays in the list). */
const SHOW_MS = 15_000;

/** A small "new battle report" notice that opens the report when tapped. */
export const createReportToast = (onOpen: (id: string) => void): ReportToast => {
  const root = el("div", "report-toast");
  root.hidden = true;
  root.dataset.testid = "report-toast";
  let timer: number | null = null;

  const hide = (): void => {
    root.hidden = true;
    root.replaceChildren();
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };

  return {
    root,
    hide,
    show: (report) => {
      const button = el("button", `toast-btn result-${report.result}`);
      button.type = "button";
      button.dataset.testid = "report-toast-open";
      button.dataset.reportId = report.id;
      button.append(el("span", "toast-title", t("report.newReport")), el("span", "toast-result", t(`march.result.${report.result}`)));
      button.addEventListener("click", () => {
        hide();
        onOpen(report.id);
      });
      root.replaceChildren(button);
      root.hidden = false;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(hide, SHOW_MS);
    },
  };
};
