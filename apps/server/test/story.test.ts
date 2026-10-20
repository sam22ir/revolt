import { chaptersFor, HEROES } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { body, newGuest, startServer, type Json, type Server } from "./harness.ts";
import { editBase, getMap, getState, heroIntent, intent, march, nearestNpc } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer();
});
afterEach(() => server.dispose());

const say = async (token: string, b: unknown): Promise<Json> => body(await intent(server, token, b));

describe("story_claim", () => {
  test("refused until the objectives are met, then pays the reward once and moves on", async () => {
    const g = await newGuest(server);
    expect(await say(g.token, { type: "story_claim" })).toMatchObject({ ok: false, reason: "objectives_unmet" });
    expect((await say(g.token, { type: "upgrade", building: "hq" })).ok).toBe(true);
    server.now += 59_000;
    expect(await say(g.token, { type: "story_claim" })).toMatchObject({ ok: false, reason: "objectives_unmet" });
    server.now += 1000;
    const r = await say(g.token, { type: "story_claim" });
    expect(r.ok).toBe(true);
    expect(r.state.story.chapter).toBe(1);
    expect(r.state.heroes.courier.shards).toBe(chaptersFor()[0]!.reward.shards.courier);
    expect(await getState(server, g.token)).toEqual(r.state);
    // The same chapter cannot be claimed twice: the next one is now current and unmet.
    expect(await say(g.token, { type: "story_claim" })).toMatchObject({ ok: false, reason: "objectives_unmet" });
  });

  test("numbers and chapters sent by the client are ignored", async () => {
    const g = await newGuest(server);
    const r = await say(g.token, { type: "story_claim", chapter: 3, reward: { support: 1e9 }, victories: 99 });
    expect(r).toMatchObject({ ok: false, reason: "objectives_unmet" });
    expect(r.state.story).toEqual({ chapter: 0, victories: 0 });
  });

  test("the whole placeholder campaign can be played through the public intents", async () => {
    const g = await newGuest(server);
    const t = g.token;
    // Chapter 1: upgrade the headquarters.
    await say(t, { type: "upgrade", building: "hq" });
    server.now += 60_000;
    expect((await say(t, { type: "story_claim" })).ok).toBe(true);
    // Chapter 2: recruit the first hero with the chapter 1 reward, and have 20 troops.
    expect((await heroIntent(server, t, "hero_recruit", "courier")).ok).toBe(true);
    const train = await say(t, { type: "train", troop: "infantry", count: 10 });
    expect(train.ok).toBe(true);
    server.now = train.state.training.endsAt;
    expect((await say(t, { type: "story_claim" })).ok).toBe(true);
    // Chapter 3: level the hero, win a march with it, come home.
    expect((await heroIntent(server, t, "hero_level", "courier")).ok).toBe(true);
    expect(await say(t, { type: "story_claim" })).toMatchObject({ ok: false, reason: "objectives_unmet" });
    const npc = nearestNpc(await getMap(server, t));
    const sent = await march(server, t, npc.id, { infantry: 20 }, ["courier"]);
    expect(sent.ok).toBe(true);
    const m = sent.state.marches[0];
    server.now = m.arriveAt;
    await server.fireAlarm();
    server.now = m.returnAt;
    await server.fireAlarm();
    const home = await getState(server, t);
    expect(home.story.victories).toBe(1);
    const last = await say(t, { type: "story_claim" });
    expect(last.ok).toBe(true);
    expect(last.state.story.chapter).toBe(chaptersFor().length);
    expect(last.state.heroes.medic.shards).toBe(chaptersFor()[2]!.reward.shards.medic);
    expect(await say(t, { type: "story_claim" })).toMatchObject({ ok: false, reason: "story_complete" });
    expect(HEROES.medic.recruitShards).toBeLessThanOrEqual(last.state.heroes.medic.shards);
  });

  test("a stale base without story progress still claims from chapter 1", async () => {
    const g = await newGuest(server);
    await editBase(server, g.res.account.id, (s) => {
      delete s.story;
      s.levels.hq = 2;
    });
    const r = await say(g.token, { type: "story_claim" });
    expect(r.ok).toBe(true);
    expect(r.state.story.chapter).toBe(1);
  });
});
