import { describe, expect, test } from "vitest";
import {
  activeEvents,
  claimableWindows,
  EVENT_CLAIM_GRACE_MS,
  EVENT_IDS,
  EVENTS,
  eventReward,
  eventRewardTier,
  eventScoreFor,
  eventsFor,
  eventWindow,
  marchAwards,
  parseEventKey,
  passSeasonAt,
  PASS_SEASON_MS,
  LIVE_ANCHOR,
} from "../src/index.ts";
import { DAY } from "./helpers.ts";

describe("event windows", () => {
  test("a window is open from its start (inclusive) to its end (exclusive)", () => {
    const w = eventWindow("convoy_hunt", 4);
    expect(activeEvents(w.startsAt, "algeria").map((x) => x.key)).toContain(w.key);
    expect(activeEvents(w.endsAt - 1, "algeria").map((x) => x.key)).toContain(w.key);
    expect(activeEvents(w.endsAt, "algeria").map((x) => x.key)).not.toContain(w.key);
    expect(activeEvents(w.startsAt - 1, "algeria").map((x) => x.key)).not.toContain(w.key);
  });

  test("nothing runs before the anchor", () => {
    expect(activeEvents(LIVE_ANCHOR - 1, "algeria")).toEqual([]);
    expect(activeEvents(0, "vietnam")).toEqual([]);
    expect(activeEvents(-5 * DAY, "vietnam")).toEqual([]);
    expect(claimableWindows(LIVE_ANCHOR - 1, "algeria")).toEqual([]);
  });

  test("the answer depends only on the clock: asking in any order, or going backwards, gives the same windows", () => {
    const t = LIVE_ANCHOR + 40 * DAY + 123;
    const first = activeEvents(t, "algeria");
    activeEvents(t + 90 * DAY, "algeria");
    activeEvents(t - 20 * DAY, "algeria");
    expect(activeEvents(t, "algeria")).toEqual(first);
  });

  test("a very long gap lands in the right window", () => {
    const t = LIVE_ANCHOR + 5000 * 7 * DAY + 2 * DAY;
    const w = activeEvents(t, "algeria").find((x) => x.id === "supply_route");
    expect(w?.index).toBe(5000);
    expect(w?.startsAt).toBe(LIVE_ANCHOR + 5000 * 7 * DAY);
  });

  test("events are filtered by background; the placeholder siege campaign is Vietnam's only", () => {
    expect(eventsFor("algeria")).toContain("seasonal_campaign");
    expect(eventsFor("algeria")).not.toContain("vietnam_seasonal_placeholder");
    expect(eventsFor("vietnam")).toContain("vietnam_seasonal_placeholder");
    expect(eventsFor("vietnam")).not.toContain("seasonal_campaign");
    const t = LIVE_ANCHOR + DAY;
    expect(activeEvents(t, "algeria").map((w) => w.id)).not.toContain("vietnam_seasonal_placeholder");
    expect(activeEvents(t, "vietnam").map((w) => w.id)).not.toContain("seasonal_campaign");
  });

  test("a gap between windows has no active window but the ended one is claimable, until the grace runs out", () => {
    const w = eventWindow("convoy_hunt", 2);
    const gap = w.endsAt + 1000; // convoy_hunt is open 2 of every 3 days
    expect(activeEvents(gap, "algeria").map((x) => x.id)).not.toContain("convoy_hunt");
    expect(claimableWindows(gap, "algeria").map((x) => x.key)).toContain(w.key);
    // The next window is open again; the claimable one is then the window before it only if still in grace.
    const later = w.endsAt + EVENT_CLAIM_GRACE_MS + 1;
    expect(claimableWindows(later, "algeria").map((x) => x.key)).not.toContain(w.key);
  });

  test("keys round-trip and refuse junk", () => {
    expect(parseEventKey("supply_route:12")).toEqual({ id: "supply_route", index: 12 });
    for (const bad of ["nope:1", "supply_route", "supply_route:-1", "supply_route:1:2", 5, null, "supply_route:1e3"]) expect(parseEventKey(bad)).toBeNull();
  });
});

describe("scores and rewards", () => {
  test("only victories score; level scales it; a clean win earns a bonus", () => {
    const d = EVENTS.supply_route;
    expect(eventScoreFor("supply_route", "defeat", 3, 0)).toBe(0);
    expect(eventScoreFor("supply_route", "target_gone", 3, 0)).toBe(0);
    expect(eventScoreFor("supply_route", "victory", 1, 4)).toBe(d.pointsPerLevel);
    expect(eventScoreFor("supply_route", "victory", 3, 4)).toBe(3 * d.pointsPerLevel);
    expect(eventScoreFor("supply_route", "victory", 3, 0)).toBe(3 * d.pointsPerLevel + d.cleanBonus);
    expect(eventScoreFor("supply_route", "victory", 0, 0)).toBe(0);
  });

  test("the reward tier is the highest score threshold reached", () => {
    for (const id of EVENT_IDS) {
      const tiers = EVENTS[id].tiers;
      expect(eventRewardTier(id, 0)).toBe(-1);
      expect(eventReward(id, 0)).toBeNull();
      tiers.forEach((t, i) => {
        expect(eventRewardTier(id, t.score - 1)).toBe(i - 1);
        expect(eventRewardTier(id, t.score)).toBe(i);
      });
      expect(eventRewardTier(id, 1e12)).toBe(tiers.length - 1);
    }
  });

  test("marchAwards: one award per open event and one for the pass, none for a vanished target without pass xp", () => {
    const t = LIVE_ANCHOR + 2 * DAY;
    const awards = marchAwards("algeria", t, "victory", 2, 0);
    const keys = awards.map((a) => a.key);
    expect(keys).toContain(eventWindow("supply_route", 0).key);
    expect(keys).toContain(`pass:${passSeasonAt(t).index}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(marchAwards("algeria", t, "target_gone", 2, 0)).toEqual([]);
    // A defeat scores no event points but still earns a little pass xp.
    expect(marchAwards("algeria", t, "defeat", 2, 5).map((a) => a.key)).toEqual([`pass:0`]);
    expect(marchAwards("algeria", LIVE_ANCHOR - 1, "victory", 2, 0).map((a) => a.key)).toEqual(["pass:0"]);
  });
});

describe("pass seasons", () => {
  test("seasons tile time with no gaps, and times before the anchor count as season 0", () => {
    expect(passSeasonAt(LIVE_ANCHOR - DAY).index).toBe(0);
    const s = passSeasonAt(LIVE_ANCHOR + PASS_SEASON_MS);
    expect(s.index).toBe(1);
    expect(passSeasonAt(s.startsAt - 1).index).toBe(0);
    expect(passSeasonAt(s.endsAt - 1).index).toBe(1);
    expect(passSeasonAt(s.endsAt).index).toBe(2);
  });
});

describe("event data", () => {
  test("every window fits its period, tiers ascend, and unreviewed events say so", () => {
    for (const id of EVENT_IDS) {
      const d = EVENTS[id];
      expect(d.durationMs).toBeLessThanOrEqual(d.periodMs);
      expect(d.durationMs).toBeGreaterThan(0);
      d.tiers.forEach((t, i) => i > 0 && expect(t.score).toBeGreaterThan(d.tiers[i - 1]!.score));
      expect(d.backgrounds.length).toBeGreaterThan(0);
    }
    expect(EVENTS.vietnam_seasonal_placeholder.needsReview).toBe(true);
    expect(EVENTS.seasonal_campaign.needsReview).toBe(true);
  });
});
