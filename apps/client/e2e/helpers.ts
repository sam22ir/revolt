import { devices, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

export const T0 = new Date("2026-07-01T12:00:00Z").getTime();
export const API = "http://localhost:8788";
export const SHOTS = "test-results/screens";
// Known, unexplained: in headless Chromium the WebGL canvas shows black above a DOM panel that scrolls
// (barracks, long reports), so some screenshots below show a black area. It does not happen with
// `overflow: visible` on the panel and is hidden by ANGLE SwiftShader (too slow for this suite). Not
// confirmed on a real phone; see the M3 notes.

/** Any untranslated i18n key that leaked into the page. */
export const RAW_KEY = /\b(app|resource|building|panel|reason|queue|time|settings|language|account|sync|map|march|report|troop|npc|terrain|train|result|alliance|chat|help|rally|nav|tab)\.[a-z_]+\b/;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Moves both clocks: the server's (the truth, and the map's alarm) and the device's (prediction only). */
export const setTime = async (pages: readonly Page[], request: APIRequestContext, now: number): Promise<void> => {
  const res = await request.post(`${API}/__test/clock`, { data: { now } });
  expect(res.ok()).toBe(true);
  for (const p of pages) await p.clock.setFixedTime(now);
};

export const openGame = async (browser: Browser, locale: string): Promise<Page> => {
  const context = await browser.newContext({ ...devices["Pixel 7"], locale, baseURL: "http://localhost:4173" });
  const page = await context.newPage();
  await page.clock.setFixedTime(T0);
  await page.goto("/");
  await page.waitForFunction(() => window.__revolt !== undefined);
  await page.locator("canvas").waitFor();
  return page;
};

export const expectNoRawKeys = async (page: Page): Promise<void> => {
  expect(await page.locator("#ui").innerText()).not.toMatch(RAW_KEY);
};

/** Opens the map and waits until it shows at least `bases` camps (earlier tests share the same map). */
export const openMap = async (page: Page, bases: number): Promise<void> => {
  await page.getByTestId("map-toggle").click();
  await expect.poll(() => page.evaluate(() => window.__revolt?.map?.snapshot()?.bases.length ?? 0)).toBeGreaterThanOrEqual(bases);
};

export const ownCamp = (page: Page) => page.evaluate(() => window.__revolt!.map!.snapshot()!.bases.find((x) => x.mine)!);

/** Centres the map on a tile and taps it. */
export const tapTile = async (page: Page, tile: Point): Promise<void> => {
  await page.evaluate(({ x, y }) => window.__revolt!.map!.centerOn(x, y), tile);
  await page.waitForTimeout(200);
  const p = await page.evaluate(({ x, y }) => window.__revolt!.map!.tileScreenPoint(x, y), tile);
  if (p === null) throw new Error("tile not on screen");
  await page.touchscreen.tap(p.x, p.y);
};

