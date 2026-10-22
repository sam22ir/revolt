import type { MapNpcView } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { nextTarget } from "../src/state/target-search.ts";

const npc = (id: string, x: number, y: number, level = 1): MapNpcView => ({ id, x, y, level, kind: "patrol", region: null });
const HOME = { x: 10, y: 10 };

describe("nextTarget", () => {
  const npcs = [npc("c", 30, 10), npc("a", 12, 10), npc("b", 10, 15), npc("far", 60, 60), npc("l2", 11, 10, 2)];

  test("the nearest target of the level comes first, ignoring other levels", () => {
    expect(nextTarget(npcs, HOME, 1, null)?.id).toBe("a");
    expect(nextTarget(npcs, HOME, 2, null)?.id).toBe("l2");
  });

  test("searching again walks outward, then wraps to the nearest", () => {
    const seen: string[] = [];
    let last: string | null = null;
    for (let i = 0; i < 5; i++) {
      last = nextTarget(npcs, HOME, 1, last)?.id ?? null;
      seen.push(last ?? "none");
    }
    expect(seen).toEqual(["a", "b", "c", "far", "a"]);
  });

  test("ties in distance go to the lower id", () => {
    const tied = [npc("z", 10, 12), npc("m", 12, 10)];
    expect(nextTarget(tied, HOME, 1, null)?.id).toBe("m");
    expect(nextTarget(tied, HOME, 1, "m")?.id).toBe("z");
  });

  test("a last target that is gone starts again from the nearest", () => {
    expect(nextTarget(npcs, HOME, 1, "died-and-respawned-elsewhere")?.id).toBe("a");
  });

  test("a single target is found again; none at all gives null", () => {
    expect(nextTarget([npc("only", 5, 5)], HOME, 1, "only")?.id).toBe("only");
    expect(nextTarget(npcs, HOME, 3, null)).toBeNull();
    expect(nextTarget([], HOME, 1, null)).toBeNull();
  });

  test("distance is measured from the given base, not from the origin", () => {
    expect(nextTarget(npcs, { x: 60, y: 59 }, 1, null)?.id).toBe("far");
  });
});
