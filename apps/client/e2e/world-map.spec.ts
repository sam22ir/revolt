import { devices, expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

const T0 = new Date("2026-07-01T12:00:00Z").getTime();
const API = "http://localhost:8788";
const SHOTS = "test-results/screens";
// Known, unexplained: in headless Chromium the WebGL canvas shows black above a DOM panel that scrolls
// (barracks, long reports), so some screenshots below show a black area. It does not happen with
// `overflow: visible` on the panel and is hidden by ANGLE SwiftShader (too slow for this suite). Not
// confirmed on a real phone; see the M3 notes.

/** Any untranslated i18n key that leaked into the page. */
const RAW_KEY = /\b(app|resource|building|panel|reason|queue|time|settings|language|account|sync|map|march|report|troop|npc|terrain|train|result)\.[a-z_]+\b/;

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Moves both clocks: the server's (the truth, and the map's alarm) and the device's (prediction only). */
const setTime = async (pages: readonly Page[], request: APIRequestContext, now: number): Promise<void> => {
  const res = await request.post(`${API}/__test/clock`, { data: { now } });
  expect(res.ok()).toBe(true);
  for (const p of pages) await p.clock.setFixedTime(now);
};

const openGame = async (browser: Browser, locale: string): Promise<Page> => {
  const context = await browser.newContext({ ...devices["Pixel 7"], locale, baseURL: "http://localhost:4173" });
  const page = await context.newPage();
  await page.clock.setFixedTime(T0);
  await page.goto("/");
  await page.waitForFunction(() => window.__revolt !== undefined);
  await page.locator("canvas").waitFor();
  return page;
};

const expectNoRawKeys = async (page: Page): Promise<void> => {
  expect(await page.locator("#ui").innerText()).not.toMatch(RAW_KEY);
};

/** Opens the map and waits until it shows at least `bases` camps (earlier tests share the same map). */
const openMap = async (page: Page, bases: number): Promise<void> => {
  await page.getByTestId("map-toggle").click();
  await expect.poll(() => page.evaluate(() => window.__revolt?.map?.snapshot()?.bases.length ?? 0)).toBeGreaterThanOrEqual(bases);
};

const ownCamp = (page: Page) => page.evaluate(() => window.__revolt!.map!.snapshot()!.bases.find((x) => x.mine)!);

/** Centres the map on a tile and taps it. */
const tapTile = async (page: Page, tile: Point): Promise<void> => {
  await page.evaluate(({ x, y }) => window.__revolt!.map!.centerOn(x, y), tile);
  await page.waitForTimeout(200);
  const p = await page.evaluate(({ x, y }) => window.__revolt!.map!.tileScreenPoint(x, y), tile);
  if (p === null) throw new Error("tile not on screen");
  await page.touchscreen.tap(p.x, p.y);
};

const LOCALES = [
  { locale: "en-US", lang: "en", dir: "ltr" },
  { locale: "ar-DZ", lang: "ar", dir: "rtl" },
] as const;

for (const { locale, lang, dir } of LOCALES) {
  test(`two players share the map; a march fights and returns with a report (${lang})`, async ({ browser, request }) => {
    test.setTimeout(240_000);
    await setTime([], request, T0);
    const a = await openGame(browser, locale);
    const b = await openGame(browser, locale);
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
    await a.screenshot({ path: `${SHOTS}/${lang}-m3-0-training.png` });
    await setTime([a, b], request, T0 + 60_000);
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
    await a.screenshot({ path: `${SHOTS}/${lang}-m3-1-other-camp.png` });

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
    await a.screenshot({ path: `${SHOTS}/${lang}-m3-2-send-march.png` });
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
    await a.screenshot({ path: `${SHOTS}/${lang}-m3-3-marching.png` });

    // Arrival: the map's alarm fights the battle and pushes the report.
    await setTime([a, b], request, m.arriveAt);
    await expect(a.getByTestId("report-toast-open")).toBeVisible({ timeout: 15_000 });
    await a.getByTestId("report-toast-open").click();
    await expect(a.getByTestId("report")).toBeVisible();
    await expectNoRawKeys(a);
    await a.screenshot({ path: `${SHOTS}/${lang}-m3-4-report.png` });

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
