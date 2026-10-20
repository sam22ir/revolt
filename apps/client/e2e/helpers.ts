import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { devices, expect, type APIRequestContext, type Browser, type CDPSession, type Page } from "@playwright/test";

export const T0 = new Date("2026-07-01T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

/**
 * Start time for the `slot`-th test that uses the shared map, in file order. The map settles at the latest time it has
 * seen and never goes back, so a test starting at the same T0 as an earlier one would find its new march or rally
 * already past and resolved. Each slot starts a day after the previous one, well after its returns.
 */
export const mapEpoch = (slot: number): number => T0 + slot * DAY;
/**
 * Pixel 7 at 1× pixel ratio. The game renders at devicePixelRatio, and software WebGL at Pixel 7's 2.625× draws a
 * frame in ~100 ms (two pages saturate this 2-core machine); at 1× it is about 4× faster. Screenshots switch to the
 * real ratio for the capture only (see `screenshot`), so the images are still full Pixel 7 resolution.
 */
export const PHONE = { ...devices["Pixel 7"], deviceScaleFactor: 1 };
const PHONE_DPR = devices["Pixel 7"].deviceScaleFactor;

export const API = "http://localhost:8788";
export const SHOTS = "test-results/screens";


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

/**
 * Waits until Phaser has stepped (updated and drawn) `count` more frames: a real condition instead of a fixed sleep.
 * Only a page in front gets animation frames, so this brings the page to the front.
 */
export const waitForFrames = async (page: Page, count = 2): Promise<void> => {
  await page.bringToFront();
  const start = await page.evaluate(() => window.__revolt!.frame());
  await page.waitForFunction((target) => window.__revolt!.frame() >= target, start + count);
};

/** The game is loaded and Phaser has drawn its first frames. */
export const waitForGame = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => window.__revolt !== undefined);
  await page.locator("canvas").waitFor();
  await waitForFrames(page);
};

export const openGame = async (browser: Browser, locale: string, now: number): Promise<Page> => {
  const context = await browser.newContext({ ...PHONE, locale, baseURL: "http://localhost:4173" });
  const page = await context.newPage();
  await page.clock.setFixedTime(now);
  await page.goto("/");
  await waitForGame(page);
  return page;
};

/** The canvas backing store matches the current pixel ratio, i.e. the game has caught up with a ratio change. */
const canvasAtRatio = (page: Page, ratio: number) =>
  page.waitForFunction((r) => {
    const canvas = document.querySelector("canvas");
    return canvas !== null && window.devicePixelRatio === r && canvas.width === Math.round(canvas.getBoundingClientRect().width * r);
  }, ratio);

/** One CDP session per page, kept open: Chrome drops a session's emulation override when it detaches. */
const sessions = new WeakMap<Page, CDPSession>();

const cdpOf = async (page: Page): Promise<CDPSession> => {
  const known = sessions.get(page);
  if (known !== undefined) return known;
  const cdp = await page.context().newCDPSession(page);
  sessions.set(page, cdp);
  return cdp;
};

/** Device metrics as Playwright emulates them, with only the pixel ratio changed. */
const setPixelRatio = async (page: Page, ratio: number): Promise<void> => {
  const cdp = await cdpOf(page);
  const { width, height } = page.viewportSize()!;
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: ratio, mobile: true });
  // A ratio change alone fires no resize; the game re-fits its canvas on resize, as it does on rotation.
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await canvasAtRatio(page, ratio);
};

/** A full-resolution Pixel 7 screenshot of a page that otherwise runs at 1× (see `PHONE`). */
export const screenshot = async (page: Page, path: string): Promise<void> => {
  await page.bringToFront();
  await setPixelRatio(page, PHONE_DPR);
  await waitForFrames(page);
  // Playwright's own screenshot renders at the context's ratio (1×); Chrome's captures at the override.
  const { data } = await (await cdpOf(page)).send("Page.captureScreenshot", { format: "png" });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(data, "base64"));
  await setPixelRatio(page, 1);
};

export const expectNoRawKeys = async (page: Page): Promise<void> => {
  expect(await page.locator("#ui").innerText()).not.toMatch(RAW_KEY);
};

/** Opens the map and waits until it shows at least `bases` camps (earlier tests share the same map). */
export const openMap = async (page: Page, bases: number): Promise<void> => {
  await page.bringToFront();
  await page.getByTestId("map-toggle").click();
  await expect.poll(() => page.evaluate(() => window.__revolt?.map?.snapshot()?.bases.length ?? 0)).toBeGreaterThanOrEqual(bases);
  // The store can have bases before the map scene has been created; tile taps need the scene itself.
  await expect.poll(() => page.evaluate(() => window.__revolt!.map!.tileScreenPoint(0, 0) !== null)).toBe(true);
};

export const ownCamp = (page: Page) => page.evaluate(() => window.__revolt!.map!.snapshot()!.bases.find((x) => x.mine)!);

/**
 * Centres the map on a tile and taps it, until the tile panel shows that tile's coordinates. On a loaded machine the
 * game draws a frame every half second or so, so a tap can be missed or land on the tile next to it: retry, and
 * fall back to a mouse click (the same gesture for the game).
 */
export const tapTile = async (page: Page, tile: Point): Promise<void> => {
  // Two contexts share one headless browser; a page that is not in front gets no animation frames, so Phaser
  // would neither re-centre nor see the tap.
  await page.bringToFront();
  const coords = new RegExp(`(^|\\D)${tile.x}\\D+${tile.y}(\\D|$)`);
  const showsTile = async (): Promise<boolean> => {
    const shown = await page.getByTestId("tile-panel").waitFor({ state: "visible", timeout: 2500 }).then(() => true, () => false);
    return shown && coords.test(await page.getByTestId("tile-coords").innerText());
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.evaluate(({ x, y }) => window.__revolt!.map!.centerOn(x, y), tile);
    // The camera moves at once; let Phaser step past it so the tap is hit-tested against the new view.
    await waitForFrames(page);
    const p = await page.evaluate(({ x, y }) => window.__revolt!.map!.tileScreenPoint(x, y), tile);
    if (p === null) throw new Error("tile not on screen");
    if (attempt % 2 === 0) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    if (await showsTile()) return;
  }
  throw new Error(`could not select tile ${tile.x},${tile.y}`);
};

