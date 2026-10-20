import { expect, test } from "@playwright/test";
import { API, expectNoRawKeys, mapEpoch, openGame, openMap, ownCamp, screenshot, setTime, SHOTS, tapTile } from "./helpers.ts";

const LOCALES = [
  { locale: "en-US", lang: "en", dir: "ltr" },
  { locale: "ar-DZ", lang: "ar", dir: "rtl" },
] as const;

// After the alliance spec's slots (files run in name order).
const FIRST_SLOT = 3;

for (const [i, { locale, lang, dir }] of LOCALES.entries()) {
  test(`two players share the map; a march fights and returns with a report (${lang})`, { tag: "@screenshots" }, async ({ browser, request }) => {
    test.setTimeout(360_000);
    const t0 = mapEpoch(FIRST_SLOT + i);
    await setTime([], request, t0);
    const a = await openGame(browser, locale, t0);
    const b = await openGame(browser, locale, t0);
    await expect(a.locator("html")).toHaveAttribute("dir", dir);

    // Train a batch of porters in the barracks; it completes on the server clock.
    const barracks = await a.evaluate(() => window.__revolt!.buildingScreenPoint("barracks"));
    await a.touchscreen.tap(barracks.x, barracks.y);
    await expect(a.getByTestId("training")).toBeVisible();
    await a.getByTestId("troop-select").selectOption("porters");
    await a.getByTestId("train-count").fill("5");
    await a.getByTestId("train-submit").scrollIntoViewIfNeeded();
    await a.getByTestId("train-submit").click();
    await expect(a.getByTestId("training-batch")).toBeVisible();
    await expectNoRawKeys(a);
    await screenshot(a, `${SHOTS}/${lang}-m3-0-training.png`);
    await setTime([a, b], request, t0 + 60_000);
    await expect(a.getByTestId("troops-home")).toContainText("5");

    // Each sees both camps; tapping the other's tile shows its tag.
    await openMap(a, 2);
    await openMap(b, 2);

    // The map scrolls: the coordinates readout follows a drag.
    const coords = a.getByTestId("coords");
    await a.evaluate(() => window.__revolt!.map!.centerOn(32, 32));
    await expect(coords).toHaveText(/32.*32/);
    const centred = await coords.innerText();
    const box = (await a.locator("canvas").boundingBox())!;
    await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await a.mouse.down();
    await a.mouse.move(box.x + box.width / 2 - 140, box.y + box.height / 2 - 160, { steps: 8 });
    await a.mouse.up();
    await expect(coords).not.toHaveText(centred);
    await expectNoRawKeys(a);

    for (const [me, them] of [[a, b], [b, a]] as const) {
      const theirOwn = await ownCamp(them);
      const other = await me.evaluate(({ x, y }) => window.__revolt!.map!.snapshot()!.bases.find((p) => p.x === x && p.y === y)!, theirOwn);
      expect(other).toEqual({ ...theirOwn, mine: false });
      await tapTile(me, other);
      await expect(me.getByTestId("tile-panel")).toBeVisible();
      await expect(me.getByTestId("tile-panel")).toContainText(other.tag);
    }
    await expectNoRawKeys(a);
    await screenshot(a, `${SHOTS}/${lang}-m3-1-other-camp.png`);

    // Pick the nearest level-1 target and send all ten starting infantry.
    const npc = await a.evaluate(() => {
      const s = window.__revolt!.map!.snapshot()!;
      const me = s.bases.find((x) => x.mine)!;
      return s.npcs.filter((n) => n.level === 1).sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))[0]!;
    });
    await tapTile(a, npc);
    await expect(a.getByTestId("tile-panel")).toBeVisible();
    await a.getByTestId("send-march").click();
    await expect(a.getByTestId("march-dialog")).toBeVisible();
    await a.getByTestId("march-count-infantry").fill("10");
    await expectNoRawKeys(a);
    await screenshot(a, `${SHOTS}/${lang}-m3-2-send-march.png`);
    await a.getByTestId("march-submit").click();
    await expect(a.getByTestId("march-dialog")).toBeHidden();

    // The march is in flight: shown in the marches view and on b's map too.
    await expect(a.getByTestId("marches")).toBeVisible();
    const marchesSeenByB = () => b.evaluate(() => window.__revolt!.map!.snapshot()!.marches.filter((x) => !x.mine).length);
    await expect.poll(marchesSeenByB).toBe(1);
    const token = await a.evaluate(() => localStorage.getItem("revolt.session"));
    const state = await (await request.get(`${API}/v1/state`, { headers: { authorization: `Bearer ${token}` } })).json();
    const m = state.state.marches[0];
    expect(state.state.troops.infantry).toBe(0);
    await expectNoRawKeys(a);
    await screenshot(a, `${SHOTS}/${lang}-m3-3-marching.png`);
    // The same march with the column in the middle of the view, to see its marker.
    await a.evaluate(() => {
      const mm = window.__revolt!.map!.snapshot()!.marches.find((x) => x.mine)!;
      const f = Math.min(1, Math.max(0, (Date.now() - mm.departAt) / (mm.arriveAt - mm.departAt)));
      window.__revolt!.map!.centerOn(mm.from.x + (mm.to.x - mm.from.x) * f, mm.from.y + (mm.to.y - mm.from.y) * f);
    });
    await screenshot(a, `${SHOTS}/${lang}-m3-3b-march-marker.png`);

    // Where the march ends, read while it is still on the map (it leaves the snapshot on arrival).
    const battleTo = await a.evaluate(() => window.__revolt!.map!.snapshot()!.marches.find((x) => x.mine)!.to);

    // Arrival: the map's alarm fights the battle and pushes the report.
    await setTime([a, b], request, m.arriveAt);
    await expect(a.getByTestId("report-toast-open")).toBeVisible({ timeout: 15_000 });
    await a.getByTestId("report-toast-open").click();
    await expect(a.getByTestId("report")).toBeVisible();
    await expectNoRawKeys(a);
    await screenshot(a, `${SHOTS}/${lang}-m3-4-report.png`);
    // The battle marker shows at the target for a few seconds after arrival (the clock is fixed, so it is still up).
    await a.getByTestId("reports").locator(".panel-close").click();
    await a.evaluate((to) => window.__revolt!.map!.centerOn(to.x, to.y), battleTo);
    await screenshot(a, `${SHOTS}/${lang}-m3-3c-battle-marker.png`);

    // Return: the survivors are home, the march is gone from both maps.
    await setTime([a, b], request, m.returnAt);
    await expect.poll(marchesSeenByB, { timeout: 15_000 }).toBe(0);
    const home = await (await request.get(`${API}/v1/state`, { headers: { authorization: `Bearer ${token}` } })).json();
    expect(home.state.marches).toEqual([]);
    expect(home.state.troops.infantry + home.state.wounded.infantry).toBeGreaterThan(0);

    await a.context().close();
    await b.context().close();
  });
}
