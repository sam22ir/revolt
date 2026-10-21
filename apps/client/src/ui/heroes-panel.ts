import { HERO_DRAW_COST, HERO_DRAW_MIN_HALL, HERO_LEVEL_EFFECT_STEP, RESOURCE_IDS, type BaseState, type HeroId, type SkillDef } from "@revolt/rules";
import { artUrl } from "../art/art.ts";
import { formatAmount } from "../format.ts";
import { currentLanguage, t } from "../i18n/i18n.ts";
import { activeBackground } from "../state/background.ts";
import { heroCards, recruitBlock, type HeroCard } from "../state/hero-view.ts";
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
  /** One draw from the player's background roster; the server picks the hero. */
  readonly onRecruit: () => Promise<ActionOutcome>;
  readonly onLevel: (id: HeroId) => Promise<ActionOutcome>;
  /** The panel opened (so the others should close). */
  readonly onOpen: () => void;
  /** Open state lives outside, so a language change rebuilds the overlay without closing it. */
  readonly initial: { readonly open: boolean };
  readonly onChange: (state: { open: boolean }) => void;
}

type RecruitNote =
  | { readonly kind: "drawn"; readonly heroId: HeroId; readonly duplicate: boolean }
  | { readonly kind: "refused"; readonly reason: string };

/** What decides how the cards look; the panel redraws only when this changes (not on every tick). */
const structureKey = (state: BaseState, cards: readonly HeroCard[], note: RecruitNote | null): string => {
  const afford = RESOURCE_IDS.map((r) => Math.floor(state.resources[r] / 10)).join(",");
  return [
    currentLanguage(),
    state.levels.hero_hall,
    ...cards.map((c) => `${c.id}:${c.owned?.level ?? 0}:${c.owned?.shards ?? 0}:${c.busy ? 1 : 0}:${c.levelUp ?? "-"}`),
    recruitBlock(state) ?? "-",
    note === null ? "" : JSON.stringify(note),
    // Affordability can flip as resources grow; coarse buckets keep redraws rare.
    recruitBlock(state) === "insufficient" ? afford : "",
  ].join("|");
};

const skillLine = (card: HeroCard, skill: SkillDef, slot: "command" | "passive"): HTMLElement => {
  const lang = currentLanguage();
  const level = card.owned?.level ?? 1;
  const pct = Math.round(skill.value * (1 + HERO_LEVEL_EFFECT_STEP * (level - 1)) * 100);
  const li = el("li", "hero-skill");
  li.dataset.slot = slot;
  const effect = skill.stat === "attack" ? t("hero.skill.attack_pct", { troop: t(`troop.${card.def.specialty}.name`), pct: formatAmount(lang, pct) }) : t("hero.skill.defense_pct", { pct: formatAmount(lang, pct) });
  li.append(el("span", "hero-skill-slot", t(`hero.skill.${slot}`)), el("span", "hero-skill-text", `${t(`skill.${skill.id}.name`)}: ${effect}`));
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
  let recruitNote: RecruitNote | null = null;

  const chips = (card: HeroCard): HTMLElement => {
    const lang = currentLanguage();
    const list = el("ul", "cost-list");
    const need = card.nextShards ?? 0;
    const chip = el("li", (card.owned?.shards ?? 0) < need ? "cost lacking" : "cost");
    chip.append(el("span", undefined, t("heroes.costShards", { count: formatAmount(lang, need) })));
    list.append(chip);
    return list;
  };

  const renderCard = (card: HeroCard): HTMLElement => {
    const lang = currentLanguage();
    const recruited = card.owned !== null;
    const li = el("li", "hero-card");
    li.dataset.testid = "hero-card";
    li.dataset.hero = card.id;
    li.dataset.rarity = card.def.rarity;
    li.dataset.state = recruited ? "recruited" : "locked";

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
    const role = el("p", "hero-role", t(`hero.${card.id}.desc`));
    const status = el("p", "hero-status");
    status.dataset.testid = "hero-level";
    status.textContent = card.owned !== null ? t("heroes.level", { level: formatAmount(lang, card.owned.level) }) : t("heroes.notRecruited");
    if (card.busy) {
      const busy = el("span", "hero-busy", t("heroes.busy"));
      busy.dataset.testid = "hero-busy";
      status.append(busy);
    }
    body.append(head, role, status);

    if (card.owned !== null) {
      const need = card.nextShards ?? 0;
      const shards = el("div", "hero-shards");
      shards.dataset.testid = "hero-shards";
      shards.append(el("span", undefined, t("heroes.shards", { have: formatAmount(lang, card.owned.shards), need: need > 0 ? formatAmount(lang, need) : "—" })));
      const bar = el("div", "progress");
      const fill = el("div", "progress-fill");
      fill.style.inlineSize = `${(need > 0 ? Math.min(1, card.owned.shards / need) * 100 : 100).toFixed(1)}%`;
      bar.append(fill);
      shards.append(bar);
      body.append(shards);
    }

    const spec = el("p", "hero-specialty", `${t("heroes.specialty")}: ${t(`troop.${card.def.specialty}.name`)}`);
    const skills = el("ul", "hero-skills");
    skills.append(skillLine(card, card.def.command, "command"));
    for (const passive of card.def.passives) skills.append(skillLine(card, passive, "passive"));
    body.append(spec, skills);

    if (card.owned !== null) {
      if (card.nextShards === null) {
        body.append(el("p", "panel-desc", t("heroes.maxed")));
      } else {
        body.append(chips(card));
        const button = el("button", "upgrade-btn", t("heroes.levelUp"));
        button.type = "button";
        button.dataset.testid = "hero-level-up";
        button.disabled = card.levelUp !== null;
        button.addEventListener("click", () => {
          button.disabled = true;
          void deps.onLevel(card.id).then((outcome) => {
            if (outcome.ok) notes.delete(card.id);
            else notes.set(card.id, outcome.reason);
            key = "";
            if (latest !== null) update(latest);
          });
        });
        body.append(button);
        const why = notes.get(card.id) ?? card.levelUp;
        if (why !== null && why !== undefined) {
          const reason = el("p", "panel-reason", t(`reason.${why}`, { cap: formatAmount(lang, card.cap) }));
          reason.dataset.testid = "hero-reason";
          body.append(reason);
        }
      }
    }
    li.append(portrait, body);
    return li;
  };

  /** The recruit draw: one button for the whole roster, and what the last draw gave. */
  const renderRecruit = (state: BaseState): HTMLElement => {
    const lang = currentLanguage();
    const box = el("section", "hero-recruit");
    box.dataset.testid = "hero-recruit-box";
    const list = el("ul", "cost-list");
    for (const r of RESOURCE_IDS) {
      if (HERO_DRAW_COST[r] <= 0) continue;
      const li = el("li", state.resources[r] < HERO_DRAW_COST[r] ? "cost lacking" : "cost");
      li.title = t(`resource.${r}`);
      li.innerHTML = resourceIcon(r);
      li.append(el("span", undefined, formatAmount(lang, HERO_DRAW_COST[r])));
      list.append(li);
    }
    const button = el("button", "upgrade-btn", t("heroes.recruit"));
    button.type = "button";
    button.dataset.testid = "hero-recruit";
    const blocked = recruitBlock(state);
    button.disabled = blocked !== null;
    button.addEventListener("click", () => {
      button.disabled = true;
      void deps.onRecruit().then((outcome) => {
        recruitNote = outcome.ok ? (outcome.draw === undefined ? null : { kind: "drawn", ...outcome.draw }) : { kind: "refused", reason: outcome.reason };
        key = "";
        if (latest !== null) update(latest);
      });
    });
    box.append(list, button);
    const why = recruitNote?.kind === "refused" ? recruitNote.reason : blocked;
    if (why !== null && why !== undefined) {
      const reason = el("p", "panel-reason", t(`reason.${why}`, { level: formatAmount(lang, HERO_DRAW_MIN_HALL) }));
      reason.dataset.testid = "hero-reason";
      box.append(reason);
    }
    if (recruitNote?.kind === "drawn") {
      const drawn = el("p", "panel-desc hero-drawn", t(recruitNote.duplicate ? "heroes.drawnDuplicate" : "heroes.drawn", { name: t(`hero.${recruitNote.heroId}.name`) }));
      drawn.dataset.testid = "hero-drawn";
      box.append(drawn);
    }
    return box;
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
    for (const card of cards) list.append(renderCard(card));
    root.append(
      head,
      el("p", "panel-desc", t("heroes.intro")),
      el("p", "panel-desc hero-hall-note", t("heroes.hallCap", { cap: formatAmount(lang, cards[0]?.cap ?? 0) })),
      renderRecruit(state),
      list,
    );
  };

  function update(state: BaseState): void {
    latest = state;
    if (root.hidden) return;
    const cards = heroCards(state, activeBackground());
    const k = structureKey(state, cards, recruitNote);
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
