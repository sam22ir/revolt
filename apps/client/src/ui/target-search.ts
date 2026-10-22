import { MAX_NPC_LEVEL, type MapNpcView, type MapSnapshot } from "@revolt/rules";
import { t } from "../i18n/i18n.ts";
import { nextTarget } from "../state/target-search.ts";
import { el } from "./dom.ts";

export interface TargetSearch {
  readonly root: HTMLElement;
  /** Shows or hides the bar (it belongs to the map view). */
  readonly setVisible: (visible: boolean) => void;
  /** Sets the texts again, after a language change. */
  readonly relabel: () => void;
  /** Enables the Search button once the map and the player's base are known. */
  readonly update: (snap: MapSnapshot | null) => void;
}

export interface TargetSearchDeps {
  readonly snapshot: () => MapSnapshot | null;
  /** The nearest target was found: bring it into view and select it. */
  readonly onFound: (npc: MapNpcView) => void;
}

/**
 * The "find a target" bar: pick a level, tap Search, and the camera goes to the nearest target of that level from the
 * player's base. Searching again goes to the next-nearest. It lives in the HUD header, so it stays on screen when a
 * tile sheet opens and the map's free band already accounts for it.
 */
export const createTargetSearch = (deps: TargetSearchDeps): TargetSearch => {
  const root = el("div", "target-search");
  root.dataset.testid = "target-search";
  root.hidden = true;
  const levels = el("div", "target-levels");
  levels.setAttribute("role", "group");
  const buttons: HTMLButtonElement[] = [];
  for (let level = 1; level <= MAX_NPC_LEVEL; level++) {
    const b = el("button", "target-level");
    b.type = "button";
    b.dataset.level = String(level);
    b.textContent = String(level);
    b.addEventListener("click", () => choose(level));
    buttons.push(b);
    levels.append(b);
  }
  const go = el("button", "target-go");
  go.type = "button";
  go.dataset.testid = "target-go";
  const note = el("p", "target-note");
  note.setAttribute("role", "status");
  root.append(levels, go, note);

  let level = 1;
  let lastId: string | null = null;
  let found = false;

  const relabel = (): void => {
    levels.setAttribute("aria-label", t("search.title"));
    for (const b of buttons) b.setAttribute("aria-label", t("search.level", { level: Number(b.dataset.level) }));
    go.textContent = found ? t("search.next") : t("search.go");
    showNote();
  };

  /** Level 4 can only be taken by an alliance rally: say so before the player walks there. */
  const showNote = (empty = false): void => {
    note.textContent = empty ? t("search.none", { level }) : level === MAX_NPC_LEVEL ? t("rally.needed") : "";
    note.hidden = note.textContent === "";
  };

  const choose = (next: number): void => {
    level = next;
    lastId = null;
    found = false;
    for (const b of buttons) b.setAttribute("aria-pressed", String(Number(b.dataset.level) === level));
    go.textContent = t("search.go");
    showNote();
  };

  go.addEventListener("click", () => {
    const snap = deps.snapshot();
    const mine = snap?.bases.find((b) => b.mine);
    if (snap === null || mine === undefined) return;
    const target = nextTarget(snap.npcs, mine, level, lastId);
    if (target === null) {
      lastId = null;
      found = false;
      go.textContent = t("search.go");
      showNote(true);
      return;
    }
    lastId = target.id;
    found = true;
    go.textContent = t("search.next");
    showNote();
    deps.onFound(target);
  });

  choose(1);
  relabel();
  return {
    root,
    setVisible: (visible) => {
      root.hidden = !visible;
    },
    relabel,
    update: (snap) => {
      go.disabled = snap === null || !snap.bases.some((b) => b.mine);
    },
  };
};
