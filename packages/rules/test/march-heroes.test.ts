import { describe, expect, test } from "vitest";
import {
  advance,
  checkMarch,
  isBaseState,
  NPC_SHARD_DROP,
  planMarch,
  settleMarch,
  startMarch,
  ZERO_RESOURCES,
  ZERO_TROOPS,
  MARCH_RESCUE_GRACE_MS,
  type BaseState,
  type MarchOutcome,
  type MarchState,
  type SquadMember,
  type Troops,
} from "../src/index.ts";
import { base, HOUR, MIN, T0, withHeroes } from "./helpers.ts";

const t = (infantry: number): Troops => ({ ...ZERO_TROOPS, infantry });
const FROM = { x: 10, y: 10 };
const TO = { x: 16, y: 18 };
const owned = (): BaseState =>
  withHeroes({ ...base(), troops: t(40) }, { courier: { level: 3, shards: 0 }, medic: { level: 1, shards: 0 }, organizer: { level: 2, shards: 0 } });

const march = (heroes: readonly SquadMember[] | undefined, id = "m1", level = 1): Omit<MarchState, "outcome"> => ({
  id,
  target: { npcId: "n1", level, ...TO },
  from: FROM,
  troops: t(10),
  ...planMarch(FROM, TO, t(10), T0),
  ...(heroes === undefined ? {} : { heroes }),
});

const send = (s: BaseState, heroes?: readonly SquadMember[], id = "m1", level = 1): BaseState => {
  const r = startMarch(s, march(heroes, id, level), T0);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

const outcome = (result: MarchOutcome["result"], sent = t(10)): MarchOutcome => ({
  result,
  survivors: sent,
  wounded: ZERO_TROOPS,
  lost: ZERO_TROOPS,
  loot: ZERO_RESOURCES,
});

const settled = (s: BaseState, result: MarchOutcome["result"], id = "m1"): BaseState => settleMarch(s, id, outcome(result)).state;

describe("marching with heroes", () => {
  test("the squad leaves with the march, with levels taken from the state, not from the caller", () => {
    const s = send(owned(), [
      { id: "courier", level: 10 },
      { id: "medic", level: 7 },
    ]);
    expect(s.marches[0]!.heroes).toEqual([
      { id: "courier", level: 3 },
      { id: "medic", level: 1 },
    ]);
    expect(isBaseState(s)).toBe(true);
  });

  test("a march without heroes carries no hero field", () => {
    expect(send(owned()).marches[0]).not.toHaveProperty("heroes");
  });

  test("refuses heroes not owned, duplicates, more than three, and busy heroes", () => {
    const s = owned();
    expect(checkMarch(s, t(10), ["mountain_guide"])).toBe("hero_not_owned");
    expect(checkMarch(s, t(10), ["courier", "courier"])).toBe("bad_squad");
    expect(checkMarch(s, t(10), ["courier", "medic", "organizer", "quartermaster"])).toBe("bad_squad");
    const out = send(s, [{ id: "courier", level: 3 }]);
    expect(checkMarch(out, t(10), ["courier"])).toBe("hero_busy");
    expect(checkMarch(out, t(10), ["medic"])).toBeNull();
    const r = startMarch(out, march([{ id: "courier", level: 3 }], "m2"), T0);
    expect(r).toMatchObject({ ok: false, reason: "hero_busy" });
  });

  test("troop refusals come before hero refusals", () => {
    expect(checkMarch(owned(), ZERO_TROOPS, ["mountain_guide"])).toBe("no_troops");
  });

  test("heroes are free again once the march has come home", () => {
    const out = settled(send(owned(), [{ id: "courier", level: 3 }]), "defeat");
    const home = advance(out, T0 + 2 * HOUR);
    expect(home.marches).toHaveLength(0);
    expect(checkMarch(home, t(10), ["courier"])).toBeNull();
  });
});

describe("shard drops and story victories on return", () => {
  const squad: SquadMember[] = [
    { id: "courier", level: 3 },
    { id: "medic", level: 1 },
  ];
  const returnAt = (s: BaseState): number => s.marches[0]!.returnAt;

  test("a victory with heroes gives the lead hero shards for the target level, and counts for the story", () => {
    for (const level of [1, 2, 3, 4]) {
      const out = settled(send(owned(), squad, "m1", level), "victory");
      const home = advance(out, returnAt(out));
      expect(home.heroes.courier.shards).toBe(NPC_SHARD_DROP[level - 1]);
      expect(home.heroes.medic.shards).toBe(0);
      expect(home.story.victories).toBe(1);
    }
  });

  test("a defeat gives nothing", () => {
    const out = settled(send(owned(), squad), "defeat");
    const home = advance(out, returnAt(out));
    expect(home.heroes.courier.shards).toBe(0);
    expect(home.story.victories).toBe(0);
  });

  test("a victory without heroes gives nothing", () => {
    const out = settled(send(owned()), "victory");
    const home = advance(out, returnAt(out));
    expect(home.story.victories).toBe(0);
    expect(home.heroes).toEqual(owned().heroes);
  });

  test("the rescue path (target gone, or never resolved) gives nothing", () => {
    const gone = settled(send(owned(), squad), "target_gone");
    expect(advance(gone, returnAt(gone)).heroes.courier.shards).toBe(0);
    const sent = send(owned(), squad);
    const rescued = advance(sent, returnAt(sent) + MARCH_RESCUE_GRACE_MS);
    expect(rescued.marches).toHaveLength(0);
    expect(rescued.heroes.courier.shards).toBe(0);
    expect(rescued.story.victories).toBe(0);
  });

  test("advancing again, or twice, never pays twice", () => {
    const out = settled(send(owned(), squad), "victory");
    const home = advance(out, returnAt(out));
    const later = advance(advance(home, returnAt(out) + HOUR), returnAt(out) + 5 * HOUR);
    expect(later.heroes.courier.shards).toBe(home.heroes.courier.shards);
    expect(later.story.victories).toBe(1);
  });

  test("time going backwards after the return changes nothing", () => {
    const out = settled(send(owned(), squad), "victory");
    const home = advance(out, returnAt(out) + MIN);
    expect(advance(home, T0)).toEqual(home);
  });

  test("two heroes' marches returning pay each lead once", () => {
    let s = send(owned(), [{ id: "courier", level: 3 }], "m1");
    s = send(s, [{ id: "medic", level: 1 }], "m2");
    s = settled(settled(s, "victory", "m1"), "victory", "m2");
    const home = advance(s, T0 + 10 * HOUR);
    expect(home.heroes.courier.shards).toBe(NPC_SHARD_DROP[0]);
    expect(home.heroes.medic.shards).toBe(NPC_SHARD_DROP[0]);
    expect(home.story.victories).toBe(2);
  });

  test("shards stay capped", () => {
    const full = withHeroes(owned(), { courier: { level: 3, shards: 999_999 } });
    const out = settled(send(full, squad, "m1", 4), "victory");
    expect(advance(out, returnAt(out)).heroes.courier.shards).toBe(1_000_000);
  });
});
