import { DEFAULT_BACKGROUND, objectiveProgress, RESOURCE_IDS, STORY, type BaseState, type Objective, type StoryChapter } from "@revolt/rules";
import { formatAmount } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import type { ActionOutcome } from "../state/game-store.ts";
import { storyView } from "../state/hero-view.ts";
import { el } from "./dom.ts";
import { resourceIcon } from "./icons.ts";

export interface StoryPanel {
  readonly root: HTMLElement;
  readonly toggle: (open?: boolean) => void;
  readonly isOpen: () => boolean;
  readonly update: (state: BaseState) => void;
}

interface StoryDeps {
  readonly onClaim: () => Promise<ActionOutcome>;
  readonly onOpen: () => void;
  readonly initial: { readonly open: boolean };
  readonly onChange: (state: { open: boolean }) => void;
}

const chapters = (): readonly StoryChapter[] => STORY[DEFAULT_BACKGROUND];

/** The objective as a sentence. Text only: names come from i18n keys for ids, never from data. */
export const objectiveText = (o: Objective): string => {
  const lang = currentLanguage();
  switch (o.kind) {
    case "building_level":
      return t("story.objective.building_level", { building: t(`building.${o.building}.name`), level: formatAmount(lang, o.level) });
    case "troops_owned":
      return t("story.objective.troops_owned", { count: formatAmount(lang, o.count) });
    case "hero_recruited":
      return o.hero === null ? t("story.objective.hero_recruited") : t("story.objective.hero_recruited_named", { hero: t(`hero.${o.hero}.name`) });
    case "hero_level":
      return o.hero === null
        ? t("story.objective.hero_level", { level: formatAmount(lang, o.level) })
        : t("story.objective.hero_level_named", { hero: t(`hero.${o.hero}.name`), level: formatAmount(lang, o.level) });
    case "victories":
      return t("story.objective.victories", { count: formatAmount(lang, o.count) });
  }
};

/**
 * The campaign: the current chapter's scenes, its objectives with progress, and the reward to claim.
 * Every chapter is placeholder text pending historian review (GDD §6), so a draft notice is always on screen.
 */
export const createStoryPanel = (deps: StoryDeps): StoryPanel => {
  const root = el("section", "panel story-panel");
  root.hidden = !deps.initial.open;
  root.dataset.testid = "story-panel";
  let latest: BaseState | null = null;
  let key = "";
  /** Scene being read, per chapter index. */
  let scene = 0;
  let sceneChapter = -1;
  /** A claimed chapter opened for re-reading, or null. */
  let replay: number | null = null;
  let note: string | null = null;

  const scenesOf = (index: number, chapter: StoryChapter): HTMLElement => {
    if (sceneChapter !== index) {
      sceneChapter = index;
      scene = 0;
    }
    const box = el("div", "story-scenes");
    const text = el("p", "story-scene", t(`story.${DEFAULT_BACKGROUND}.${chapter.id}.scene${scene + 1}`));
    text.dataset.testid = "story-scene";
    const nav = el("div", "story-scene-nav");
    const back = el("button", "secondary-btn", t("story.back"));
    back.type = "button";
    back.disabled = scene <= 0;
    back.dataset.testid = "story-back";
    back.addEventListener("click", () => {
      scene = Math.max(0, scene - 1);
      redraw();
    });
    const counter = el("span", "story-scene-count", t("story.sceneOf", { n: formatAmount(currentLanguage(), scene + 1), total: formatAmount(currentLanguage(), chapter.scenes) }));
    const next = el("button", "secondary-btn", t("story.next"));
    next.type = "button";
    next.disabled = scene >= chapter.scenes - 1;
    next.dataset.testid = "story-next";
    next.addEventListener("click", () => {
      scene = Math.min(chapter.scenes - 1, scene + 1);
      redraw();
    });
    nav.append(back, counter, next);
    box.append(text, nav);
    return box;
  };

  const rewardLine = (chapter: StoryChapter): HTMLElement => {
    const lang = currentLanguage();
    const list = el("ul", "cost-list");
    for (const r of RESOURCE_IDS) {
      const amount = chapter.reward.resources[r];
      if (amount <= 0) continue;
      const li = el("li", "cost");
      li.title = t(`resource.${r}`);
      li.innerHTML = resourceIcon(r);
      li.append(el("span", undefined, formatAmount(lang, amount)));
      list.append(li);
    }
    for (const [hero, count] of Object.entries(chapter.reward.shards)) {
      if (count === undefined || count <= 0) continue;
      list.append(el("li", "cost", t("story.rewardShards", { count: formatAmount(lang, count), hero: t(`hero.${hero}.name`) })));
    }
    return list;
  };

  const render = (state: BaseState): void => {
    const lang = currentLanguage();
    root.replaceChildren();
    const head = el("div", "panel-head");
    const close = el("button", "panel-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("panel.close"));
    close.addEventListener("click", () => toggle(false));
    head.append(el("h2", "panel-title", t("story.title")), close);
    const draft = el("p", "story-draft", t("story.draftNotice"));
    draft.dataset.testid = "story-draft";
    draft.setAttribute("role", "note");
    root.append(head, draft);

    const view = storyView(state);
    const all = chapters();

    if (replay !== null) {
      const chapter = all[replay];
      if (chapter !== undefined) {
        const back = el("button", "secondary-btn", t("story.back"));
        back.type = "button";
        back.dataset.testid = "story-replay-close";
        back.addEventListener("click", () => {
          replay = null;
          sceneChapter = -1;
          redraw();
        });
        root.append(
          el("h3", "panel-sub", `${t("story.chapter", { n: formatAmount(lang, replay + 1) })} · ${t(`story.${DEFAULT_BACKGROUND}.${chapter.id}.title`)}`),
          scenesOf(replay, chapter),
          back,
        );
        return;
      }
      replay = null;
    }

    if (view.chapter === null) {
      const done = el("div", "story-complete");
      done.dataset.testid = "story-complete";
      done.append(el("h3", "panel-sub", t("story.complete")), el("p", "panel-desc", t("story.completeDesc")));
      root.append(done);
    } else {
      const chapter = view.chapter;
      const title = el("h3", "panel-sub story-chapter-title", `${t("story.chapter", { n: formatAmount(lang, view.claimed + 1) })} · ${t(`story.${DEFAULT_BACKGROUND}.${chapter.id}.title`)}`);
      title.dataset.testid = "story-chapter";
      root.append(title, scenesOf(view.claimed, chapter));

      root.append(el("h4", "panel-sub", t("story.objectives")));
      const list = el("ul", "story-objectives");
      for (const o of chapter.objectives) {
        const p = objectiveProgress(state, o);
        const li = el("li", p.done ? "story-objective done" : "story-objective");
        li.dataset.testid = "story-objective";
        li.dataset.done = String(p.done);
        li.append(
          el("span", "story-check", p.done ? "✓" : "○"),
          el("span", "story-objective-text", objectiveText(o)),
          el("span", "story-objective-progress", t("story.progress", { have: formatAmount(lang, p.have), need: formatAmount(lang, p.need) })),
        );
        list.append(li);
      }
      root.append(list, el("h4", "panel-sub", t("story.reward")), rewardLine(chapter));

      const claim = el("button", "upgrade-btn", t("story.claim"));
      claim.type = "button";
      claim.dataset.testid = "story-claim";
      claim.disabled = view.status !== "ready";
      claim.addEventListener("click", () => {
        claim.disabled = true;
        void deps.onClaim().then((outcome) => {
          note = outcome.ok ? null : outcome.reason;
          key = "";
          if (latest !== null) update(latest);
        });
      });
      root.append(claim);
      if (note !== null) {
        const why = el("p", "panel-reason", t(`reason.${note}`));
        why.dataset.testid = "story-reason";
        root.append(why);
      }
    }

    if (view.claimed > 0) {
      root.append(el("h4", "panel-sub", t("story.completed")));
      const done = el("ul", "story-done");
      all.slice(0, view.claimed).forEach((c, i) => {
        const li = el("li");
        const btn = el("button", "secondary-btn", `${t("story.chapter", { n: formatAmount(lang, i + 1) })} · ${t(`story.${DEFAULT_BACKGROUND}.${c.id}.title`)}`);
        btn.type = "button";
        btn.dataset.testid = "story-replay";
        btn.dataset.chapter = c.id;
        btn.addEventListener("click", () => {
          replay = i;
          sceneChapter = -1;
          redraw();
        });
        li.append(btn);
        done.append(li);
      });
      root.append(done);
    }
  };

  function redraw(): void {
    key = "";
    if (latest !== null) update(latest);
  }

  function update(state: BaseState): void {
    latest = state;
    if (root.hidden) return;
    const view = storyView(state);
    const progress = view.chapter === null ? "" : view.chapter.objectives.map((o) => objectiveProgress(state, o).have).join(",");
    const k = [currentLanguage(), view.claimed, view.status, progress, scene, replay ?? "-", note ?? "-"].join("|");
    if (k === key) return;
    key = k;
    render(state);
  }

  function toggle(open: boolean = Boolean(root.hidden)): void {
    if (open === !root.hidden) return;
    root.hidden = !open;
    deps.onChange({ open });
    if (open) {
      deps.onOpen();
      replay = null;
      sceneChapter = -1;
      note = null;
      redraw();
    }
  }

  return { root, toggle, isOpen: () => !root.hidden, update };
};
