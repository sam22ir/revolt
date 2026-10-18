import { createBaseState } from "@revolt/rules";
import { describe, expect, test } from "vitest";
import { carryCapacity, ownBase, previewMarch, tileInfo } from "../src/state/tile-info.ts";
import { SNAPSHOT } from "./fixtures.ts";

const troops = (infantry: number, porters = 0) => ({ infantry, scouts: 0, heavy: 0, porters });

describe("tileInfo", () => {
  test("tells own camp, other camp, NPC and empty land apart", () => {
    expect(tileInfo(SNAPSHOT, 10, 12).kind).toBe("own");
    expect(tileInfo(SNAPSHOT, 30, 8).kind).toBe("camp");
    const npc = tileInfo(SNAPSHOT, 14, 16);
    expect(npc.kind === "npc" && npc.def?.defenders.infantry).toBe(4);
    const empty = tileInfo(SNAPSHOT, 1, 1);
    expect(empty.kind).toBe("empty");
    expect(["plain", "hills", "forest", "mountain"]).toContain(empty.terrain);
  });

  test("finds the player's own base", () => {
    expect(ownBase(SNAPSHOT)).toMatchObject({ x: 10, y: 12 });
    expect(ownBase(null)).toBeNull();
  });
});

describe("previewMarch", () => {
  const state = createBaseState(0);

  test("no troops chosen: no travel time and a reason", () => {
    expect(previewMarch(state, { x: 0, y: 0 }, { x: 3, y: 4 }, troops(0))).toEqual({ travelMs: null, carry: 0, reason: "no_troops" });
  });

  test("a valid march has travel time and carry capacity", () => {
    const p = previewMarch(state, { x: 0, y: 0 }, { x: 3, y: 4 }, troops(5));
    expect(p.reason).toBeNull();
    // 5 tiles at 2 tiles/min = 150 s.
    expect(p.travelMs).toBe(150_000);
    expect(p.carry).toBe(50);
  });

  test("more troops than at home is refused", () => {
    expect(previewMarch(state, { x: 0, y: 0 }, { x: 3, y: 4 }, troops(11)).reason).toBe("not_enough_troops");
  });

  test("porters carry more but slow the column", () => {
    expect(carryCapacity(troops(0, 2))).toBe(120);
  });
});
