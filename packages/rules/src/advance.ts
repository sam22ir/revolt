import type { BaseState, MarchOutcome } from "./base-state.ts";
import { MARCH_RESCUE_GRACE_MS } from "./data/map.ts";
import { accrue, storageCap } from "./production.ts";
import { mapResources } from "./resources.ts";
import { addTroops } from "./troops.ts";
import { targetGone } from "./npc-battle.ts";

type Event =
  | { readonly at: number; readonly kind: "upgrade" }
  | { readonly at: number; readonly kind: "training" }
  | { readonly at: number; readonly kind: "return"; readonly id: string; readonly outcome: MarchOutcome };

/** The earliest event due by `now`. Ties go upgrade, training, then marches in order. */
const nextEvent = (s: BaseState, now: number): Event | null => {
  const events: Event[] = [];
  if (s.queue !== null) events.push({ at: s.queue.endsAt, kind: "upgrade" });
  if (s.training !== null) events.push({ at: s.training.endsAt, kind: "training" });
  for (const m of s.marches) {
    if (m.outcome !== null) events.push({ at: m.returnAt, kind: "return", id: m.id, outcome: m.outcome });
    // Safety net: a march the map server never resolved comes home unharmed, without loot.
    else events.push({ at: m.returnAt + MARCH_RESCUE_GRACE_MS, kind: "return", id: m.id, outcome: targetGone(m.troops) });
  }
  let best: Event | null = null;
  for (const e of events) if (e.at <= now && (best === null || e.at < best.at)) best = e;
  return best;
};

const apply = (s: BaseState, e: Event): BaseState => {
  if (e.kind === "upgrade" && s.queue !== null) {
    return { ...s, levels: { ...s.levels, [s.queue.building]: s.queue.toLevel }, queue: null };
  }
  if (e.kind === "training" && s.training !== null) {
    const { troop, count } = s.training;
    return { ...s, troops: { ...s.troops, [troop]: s.troops[troop] + count }, training: null };
  }
  if (e.kind === "return") {
    const cap = storageCap(s.levels.hq);
    // Loot fills storage up to the cap, and never lowers an amount already above it.
    const resources = mapResources((id) => Math.max(s.resources[id], Math.min(cap[id], s.resources[id] + e.outcome.loot[id])));
    return {
      ...s,
      resources,
      troops: addTroops(s.troops, e.outcome.survivors),
      wounded: addTroops(s.wounded, e.outcome.wounded),
      marches: s.marches.filter((m) => m.id !== e.id),
    };
  }
  return s;
};

/**
 * Brings the state up to `now`: settles production and resolves finished upgrades,
 * training and returning marches lazily, in time order. Production before an
 * upgrade's end uses the old level, after it the new one.
 */
export const advance = (state: BaseState, now: number): BaseState => {
  let s = state;
  for (let e = nextEvent(s, now); e !== null; e = nextEvent(s, now)) s = apply(accrue(s, e.at), e);
  return accrue(s, now);
};
