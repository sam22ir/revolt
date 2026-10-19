import { expect, test, type Page } from "@playwright/test";
import { mapEpoch, openGame, openMap, waitForFrames } from "./helpers.ts";

const zoom = (page: Page): Promise<number> => page.evaluate(() => window.__revolt!.map!.zoom());

test("the map zooms with the wheel and with a two-finger pinch", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await openGame(browser, "fr-FR", mapEpoch(20));
  await openMap(page, 1);
  await waitForFrames(page, 3);
  const start = await zoom(page);

  // Wheel up over the canvas zooms in (nothing sits over the middle of the map).
  await page.mouse.move(200, 420);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => zoom(page)).toBeGreaterThan(start);
  const afterWheel = await zoom(page);
  await page.mouse.wheel(0, 900);
  await expect.poll(() => zoom(page)).toBeLessThan(afterWheel);

  // Two fingers moving apart zoom in; together, out.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", gap: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: 206 - gap, y: 420, id: 1 }, { x: 206 + gap, y: 420, id: 2 }],
    });
  const before = await zoom(page);
  await touch("touchStart", 30);
  for (const gap of [45, 60, 80, 100]) {
    await touch("touchMove", gap);
    await waitForFrames(page, 1);
  }
  await touch("touchEnd", 0);
  await expect.poll(() => zoom(page)).toBeGreaterThan(before);
  const pinched = await zoom(page);
  await touch("touchStart", 100);
  for (const gap of [80, 60, 40, 25]) {
    await touch("touchMove", gap);
    await waitForFrames(page, 1);
  }
  await touch("touchEnd", 0);
  await expect.poll(() => zoom(page)).toBeLessThan(pinched);
});

test("a scrolling panel does not blank the game canvas above it", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await openGame(browser, "en-US", mapEpoch(21));
  const barracks = await page.evaluate(() => window.__revolt!.buildingScreenPoint("barracks"));
  await page.touchscreen.tap(barracks.x, barracks.y);
  await expect(page.getByTestId("training")).toBeVisible();
  await waitForFrames(page, 4);
  // The panel scrolls, and the game's colours are still visible above it (a regression painted it flat white or black).
  const scrolls = await page.getByTestId("building-panel").evaluate((e) => e.scrollHeight > e.clientHeight);
  expect(scrolls).toBe(true);
  const shot = (await page.screenshot()).toString("base64");
  const [r, g, b] = await page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    return [...ctx.getImageData(200, 270, 1, 1).data];
  }, shot);
  expect(r! + g! + b!).toBeGreaterThan(60); // not black
  expect(r! + g! + b!).toBeLessThan(600); // not white
});
