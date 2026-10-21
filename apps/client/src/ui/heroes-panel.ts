import { RESOURCE_IDS, skillPct, type BaseState, type HeroId, type HeroSkill } from "@revolt/rules";
import { artUrl } from "../art/art.ts";
import { formatAmount } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { activeBackground } from "../state/background.ts";
import { heroCards, type HeroCard } from "../state/hero-view.ts";
import type { ActionOutcome } from "../state/game-store.ts";
import { el } from "./dom.ts";
import { resourceIcon, troopIcon } from "./icons.ts";

export interface HeroesPanel {
  readonly root: HTMLElement;
  readonly toggle: (open?: boolean) => void;
  readonly isOpen: () => boolean;
  readonly update: (state: BaseState) => void;
}

interface HeroesDeps {
  readonly onRecruit: (id: HeroId) => Promise<ActionOutcome>;
  readonly onLevel: (id: HeroId) => Promise<ActionOutcome>;
  /** The panel opened (so the others should close). */
  readonly onOpen: () => void;
  /** Open state lives outside, so a language change rebuilds the overlay without closing it. */
  readonly initial: { readonly open: boolean };
  readonly onChange: (state: { open: boolean }) => void;
}

/** What decides how the cards look; the panel redraws only when this changes (not on every tick). */
const structureKey = (state: BaseState, cards: readonly HeroCard[]): string => {
  const afford = RESOURCE_IDS.map((r) => Math.floor(state.resources[r] / 10)).join(",");
  return [
    currentLanguage(),
    state.levels.hero_hall,
    ...cards.map((c) => `${c.id}:${c.progress.level}:${c.progress.shards}:${c.busy ? 1 : 0}:${c.recruit ?? "-"}:${c.levelUp ?? "-"}`),
    // Affordability can flip as resources grow; coarse buckets keep redraws rare.
    cards.some((c) => c.recruit === "insufficient" || c.levelUp === "insufficient") ? afford : "",
  ].join("|");
};

const skillLine = (card: HeroCard, skill: HeroSkill): HTMLElement => {
  const lang = currentLanguage();
  const unlocked = card.progress.level >= skill.unlockLevel;
  const pct = skillPct(skill, Math.max(card.progress.level, skill.unlockLevel));
  const li = el("li", unlocked ? "hero-skill" : "hero-skill locked");
  li.dataset.slot = skill.slot;
  const text =
    skill.kind === "carry_pct"
      ? t("hero.skill.carry_pct", { pct: formatAmount(lang, pct) })
      : t(`hero.skill.${skill.kind}`, { troop: t(`troop.${card.def.specialty}.name`), pct: formatAmount(lang, pct) });
  li.append(el("span", "hero-skill-slot", t(`hero.skill.${skill.slot}`)), el("span", "hero-skill-text", text));
  if (!unlocked) li.append(el("span", "hero-skill-lock", t("hero.skill.unlocksAt", { level: formatAmount(lang, skill.unlockLevel) })));
  return li;
};

/** The roster of heroes: recruit with shards and support, level up with shards and resources. */
export const createHeroesPanel = (deps: HeroesDeps): HeroesPanel => {
  const root = el("section", "panel heroes-panel");
  root.hidden = !deps.initial.open;
  root.dataset.testid = "heroes-panel";
  let latest: BaseState | null = null;
  let key = "";
  // Refusals from the server, per hero, until the card is redrawn with fresh state.
  const notes = new Map<HeroId, string>();

  const chips = (card: HeroCard, state: BaseState): HTMLElement => {
    const lang = currentLanguage();
    const list = el("ul", "cost-list");
    const shardsNeed = card.recruited ? (card.nextCost?.shards ?? 0) : card.def.recruitShards;
    const chip = (lacking: boolean): HTMLElement => el("li", lacking ? "cost lacking" : "cost");
    const shardChip = chip(card.progress.shards < shardsNeed);
    shardChip.append(el("span", undefined, t("heroes.costShards", { count: formatAmount(lang, shardsNeed) })));
    list.append(shardChip);
    const resources = card.recruited ? (card.nextCost?.resources ?? null) : { food: 0, materiel: 0, funds: 0, support: card.def.recruitSupport };
    if (resources !== null) {
      for (const r of RESOURCE_IDS) {
        if (resources[r] <= 0) continue;
        const li = chip(state.resources[r] < resources[r]);
        li.title = t(`resource.${r}`);
        li.innerHTML = resourceIcon(r);
        li.append(el("span", undefined, formatAmount(lang, resources[r])));
        list.append(li);
      }
    }
    return list;
  };

  const renderCard = (card: HeroCard, state: BaseState): HTMLElement => {
    const lang = currentLanguage();
    const li = el("li", "hero-card");
    li.dataset.testid = "hero-card";
    li.dataset.hero = card.id;
    li.dataset.rarity = card.def.rarity;
    li.dataset.state = card.recruited ? "recruited" : "locked";

    const portrait = el("div", "hero-portrait");
    const frame = el("img", "hero-frame");
    frame.src = artUrl(`ui/hero_frame_${card.def.rarity}`);
    frame.alt = "";
    frame.draggable = false;
    frame.setAttribute("aria-hidden", "true");
    const glyph = el("span", "hero-glyph");
    glyph.append(troopIcon(card.def.specialty));
    portrait.append(frame, glyph);

    const body = el("div", "hero-body");
    const head = el("div", "hero-head");
    head.append(el("h3", "hero-name", t(`hero.${card.id}.name`)), el("span", "hero-rarity", t(`rarity.${card.def.rarity}`)));
    const role = el("p", "hero-role", t(`hero.${card.id}.role`));
    const status = el("p", "hero-status");
    status.dataset.testid = "hero-level";
    status.textContent = card.recruited
      ? t("heroes.level", { level: formatAmount(lang, card.progress.level) })
      : t("heroes.notRecruited");
    if (card.busy) {
      const busy = el("span", "hero-busy", t("heroes.busy"));
      busy.dataset.testid = "hero-busy";
      status.append(busy);
    }
    const need = card.recruited ? (card.nextCost?.shards ?? 0) : card.def.recruitShards;
    const shards = el("div", "hero-shards");
    shards.dataset.testid = "hero-shards";
    shards.append(el("span", undefined, t("heroes.shards", { have: formatAmount(lang, card.progress.shards), need: need > 0 ? formatAmount(lang, need) : "—" })));
    const bar = el("div", "progress");
    const fill = el("div", "progress-fill");
    fill.style.inlineSize = `${(need > 0 ? Math.min(1, card.progress.shards / need) * 100 : 100).toFixed(1)}%`;
    bar.append(fill);
    shards.append(bar);

    const skills = el("ul", "hero-skills");
    for (const skill of card.def.skills) skills.append(skillLine(card, skill));
    const spec = el("p", "hero-specialty", `${t("heroes.specialty")}: ${t(`troop.${card.def.specialty}.name`)}`);

    body.append(head, role, status, shards, spec, skills);

    // Maxed heroes have nothing left to buy.
    if (card.recruited && card.nextCost === null) {
      body.append(el("p", "panel-desc", t("heroes.maxed")));
    } else {
      body.append(chips(card, state));
      const button = el("button", "upgrade-btn", card.recruited ? t("heroes.levelUp") : t("heroes.recruit"));
      button.type = "button";
      button.dataset.testid = card.recruited ? "hero-level-up" : "hero-recruit";
      const blocked = card.recruited ? card.levelUp : card.recruit;
      button.disabled = blocked !== null;
      button.addEventListener("click", () => {
        button.disabled = true;
        void (card.recruited ? deps.onLevel(card.id) : deps.onRecruit(card.id)).then((outcome) => {
          if (outcome.ok) notes.delete(card.id);
          else notes.set(card.id, outcome.reason);
          key = "";
          if (latest !== null) update(latest);
        });
      });
      body.append(button);
      const why = notes.get(card.id) ?? blocked;
      if (why !== null && why !== undefined) {
        const reason = el("p", "panel-reason", t(`reason.${why}`, { cap: formatAmount(lang, card.cap) }));
        reason.dataset.testid = "hero-reason";
        body.append(reason);
      }
    }
    li.append(portrait, body);
    return li;
  };

  const render = (state: BaseState, cards: readonly HeroCard[]): void => {
    const lang = currentLanguage();
    root.replaceChildren();
    const head = el("div", "panel-head");
    const close = el("button", "panel-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("panel.close"));
    close.addEventListener("click", () => toggle(false));
    head.append(el("h2", "panel-title", t("heroes.title")), close);
    const list = el("ul", "hero-list");
    for (const card of cards) list.append(renderCard(card, state));
    root.append(
      head,
      el("p", "panel-desc", t("heroes.intro")),
      el("p", "panel-desc hero-hall-note", t("heroes.hallCap", { cap: formatAmount(lang, cards[0]?.cap ?? 0) })),
      list,
    );
  };

  function update(state: BaseState): void {
    latest = state;
    if (root.hidden) return;
    const cards = heroCards(state, activeBackground());
    const k = structureKey(state, cards);
    if (k === key) return;
    key = k;
    render(state, cards);
  }

  function toggle(open: boolean = Boolean(root.hidden)): void {
    if (open === !root.hidden) return;
    root.hidden = !open;
    deps.onChange({ open });
    if (open) {
      deps.onOpen();
      key = "";
      if (latest !== null) update(latest);
    }
  }

  return { root, toggle, isOpen: () => !root.hidden, update };
};
