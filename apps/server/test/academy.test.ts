import { FORECAST_LOSSES_LEVEL, STUDY_MS, studyQuote, travelMs } from "@revolt/rules";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startServer, type Server } from "./harness.ts";
import { fighter, post } from "./live-helpers.ts";
import { editBase, getMap, getState, intent, march } from "./map-helpers.ts";

let server: Server;
beforeEach(async () => {
  server = await startServer({ GUEST_LIMIT_PER_HOUR: "100000" });
});
afterEach(() => server.dispose());

const study = async (token: string, lesson: unknown) => (await intent(server, token, { type: "study", lesson })).json() as Promise<Record<string, any>>;

describe("the academy", () => {
  test("a new base has it at level 1; a taught lesson is studied, paid now, learned at the end", async () => {
    const f = await fighter(server);
    expect((await getState(server, f.token)).levels.academy).toBe(1);
    expect(await study(f.token, "hidden_paths")).toMatchObject({ ok: false, reason: "not_taught" });
    await editBase(server, f.id, (s) => {
      s.lessonsTaught = ["hidden_paths"];
      s.resources = { food: 3000, materiel: 3000, funds: 3000, support: 0 };
    });
    const r = await study(f.token, "hidden_paths");
    expect(r).toMatchObject({ ok: true, state: { study: { lesson: "hidden_paths" } } });
    expect(r.state.resources.funds).toBeCloseTo(3000 - studyQuote("hidden_paths").cost.funds, 0);
    expect(await study(f.token, "hidden_paths")).toMatchObject({ ok: false, reason: "study_busy" });
    server.now += STUDY_MS[1];
    expect(await getState(server, f.token)).toMatchObject({ lessons: ["hidden_paths"], study: null });
    for (const bad of [{ type: "study" }, { type: "study", lesson: 5 }, { type: "study", lesson: "" }]) {
      expect((await intent(server, f.token, bad)).status).toBe(400);
    }
    expect(await study(f.token, "flying")).toMatchObject({ ok: false, reason: "unknown_lesson" });
  });

  test("a studied march lesson makes the march faster", async () => {
    const f = await fighter(server);
    const snap = await getMap(server, f.token);
    const mine = snap.bases.find((b) => b.mine)!;
    const npc = snap.npcs.filter((n) => n.level === 1).sort((a, b) => Math.hypot(b.x - mine.x, b.y - mine.y) - Math.hypot(a.x - mine.x, a.y - mine.y))[0]!;
    await editBase(server, f.id, (s) => {
      s.lessons = ["hidden_paths", "night_marches", "high_passes"];
    });
    const r = await march(server, f.token, npc.id, { infantry: 20 });
    const m = r.state.marches.at(-1);
    const plain = travelMs(mine, npc, { infantry: 20, scouts: 0, heavy: 0, porters: 0 });
    expect(m.arriveAt - m.departAt).toBeLessThan(plain);
  });

  test("the messengers' lookout lesson sharpens the forecast like a higher watchtower", async () => {
    const f = await fighter(server);
    const body = { level: 2, troops: { infantry: 20, scouts: 10, heavy: 0, porters: 0 } };
    expect((await post(server, f.token, "/v1/scout", body)).forecast.lost).toBeNull();
    await editBase(server, f.id, (s) => {
      s.levels.watchtower = FORECAST_LOSSES_LEVEL - 1;
      s.lessons = ["lookout_network"];
    });
    expect(typeof (await post(server, f.token, "/v1/scout", body)).forecast.lost).toBe("number");
  });
});
