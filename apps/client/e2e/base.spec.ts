import { devices, expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { expectNoRawKeys, PHONE, screenshot, waitForGame } from "./helpers.ts";

const T0 = new Date("2026-06-01T12:00:00Z").getTime();
const API = "http://localhost:8788";
const SHOTS = "test-results/screens";


type BuildingId = "hq" | "farm" | "armory" | "treasury";

/** Sets the e2e Worker's clock; null returns it to real time. The server owns time. */
const serverClock = async (request: APIRequestContext, now: number | null): Promise<void> => {
  const res = await request.post(`${API}/__test/clock`, { data: { now } });
  expect(res.ok()).toBe(true);
};

/** Moves both clocks: the device's (prediction only) and the server's (the truth). */
const setTime = async (page: Page, request: APIRequestContext, now: number): Promise<void> => {
  await serverClock(request, now);
  await page.clock.setFixedTime(now);
};

test.beforeEach(async ({ request }) => {
  await serverClock(request, null);
});


/** Like a player: an open building panel covers part of the base, so close it before tapping the next building. */
const tapBuilding = async (page: Page, id: BuildingId): Promise<void> => {
  const panel = page.getByTestId("building-panel");
  if (await panel.isVisible()) await panel.locator(".panel-close").click();
  const p = await page.evaluate((b) => window.__revolt!.buildingScreenPoint(b), id);
  await page.touchscreen.tap(p.x, p.y);
};


const LOCALES = [
  { locale: "en-US", lang: "en", dir: "ltr", upgrade: "Upgrade" },
  { locale: "ar-DZ", lang: "ar", dir: "rtl", upgrade: "ترقية" },
  { locale: "fr-FR", lang: "fr", dir: "ltr", upgrade: "Améliorer" },
] as const;

for (const { locale, lang, dir, upgrade } of LOCALES) {
  test.describe(`${lang}`, () => {
    test.use({ locale });

    test(`base, gating, upgrade countdown and completion after restart (${lang})`, { tag: "@screenshots" }, async ({ page, request }) => {
      await setTime(page, request, T0);
      await page.goto("/");
      await waitForGame(page);

      // Language follows the device; direction mirrors.
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.locator(".res")).toHaveCount(4);
      await expectNoRawKeys(page);
      await screenshot(page, `${SHOTS}/${lang}-1-base.png`);

      // A producer is gated by the HQ level at the start.
      await tapBuilding(page, "farm");
      await expect(page.getByTestId("building-panel")).toBeVisible();
      await expect(page.getByTestId("upgrade")).toBeDisabled();
      await expect(page.getByTestId("reason")).toBeVisible();
      await expectNoRawKeys(page);
      await screenshot(page, `${SHOTS}/${lang}-2-farm-gated.png`);

      // Upgrade the HQ: cost is paid and a countdown starts.
      await tapBuilding(page, "hq");
      await expect(page.getByTestId("building-panel")).toHaveAttribute("data-building", "hq");
      const button = page.getByTestId("upgrade");
      await expect(button).toHaveText(upgrade);
      await expect(button).toBeEnabled();
      await button.click();
      await expect(page.getByTestId("countdown")).toBeVisible();
      await expect(page.locator('.res[data-resource="food"] .res-amount')).toHaveText("300");
      await expectNoRawKeys(page);
      await screenshot(page, `${SHOTS}/${lang}-3-hq-upgrading.png`);

      // The upgrade lives on the server; the device keeps only its session token.
      const local = await page.evaluate(() => ({ save: localStorage.getItem("revolt.save"), session: localStorage.getItem("revolt.session") }));
      expect(local.save).toBeNull();
      expect(local.session).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const server = await request.get(`${API}/v1/state`, { headers: { authorization: `Bearer ${local.session}` } });
      expect((await server.json()).state.queue.building).toBe("hq");

      // "Close the app" for an hour: the upgrade completes and resources accrue.
      await setTime(page, request, T0 + 60 * 60 * 1000);
      await page.reload();
      await waitForGame(page);
      // 300 + 120/h for 1 h.
      await expect(page.locator('.res[data-resource="food"] .res-amount')).toHaveText("420");
      await tapBuilding(page, "hq");
      await expect(page.getByTestId("building-panel").locator(".panel-level")).toContainText("2");
      await expect(page.getByTestId("countdown")).toHaveCount(0);
      await expect(page.locator(".queue-pill")).not.toHaveClass(/busy/);

      // Now the farm can be upgraded.
      await tapBuilding(page, "farm");
      await expect(page.getByTestId("upgrade")).toBeEnabled();
      await screenshot(page, `${SHOTS}/${lang}-4-after-restart.png`);
    });
  });
}

test("language switcher changes language and direction, and is remembered", async ({ page, request }) => {
  await setTime(page, request, T0);
  await page.goto("/");
  await waitForGame(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.getByTestId("language").selectOption("ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expectNoRawKeys(page);
  await page.reload();
  await waitForGame(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
});

test.describe("at Pixel 7's real pixel ratio", () => {
  test.use({ deviceScaleFactor: devices["Pixel 7"].deviceScaleFactor });

  test("the canvas renders at the device pixel ratio", async ({ page }) => {
    await page.goto("/");
    await waitForGame(page);
    const expectSharpCanvas = async (): Promise<void> => {
      const size = await page.evaluate(() => {
        const canvas = document.querySelector("canvas")!;
        const rect = canvas.getBoundingClientRect();
        return { dpr: window.devicePixelRatio, width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height };
      });
      // Pixel 7 is 2.625×; a CSS-resolution canvas would make this 1.
      expect(size.dpr).toBeGreaterThan(2);
      expect(size.width).toBe(Math.round(size.cssWidth * size.dpr));
      expect(size.height).toBe(Math.round(size.cssHeight * size.dpr));
      // The canvas still fills the viewport in CSS pixels.
      expect(size.cssWidth).toBe(page.viewportSize()!.width);
      expect(size.cssHeight).toBe(page.viewportSize()!.height);
    };
    await expectSharpCanvas();

    // Rotating the phone resizes the canvas, and taps still land on buildings.
    const { width, height } = page.viewportSize()!;
    await page.setViewportSize({ width: height, height: width });
    await expect
      .poll(() => page.evaluate(() => document.querySelector("canvas")!.width === Math.round(window.innerWidth * window.devicePixelRatio)))
      .toBe(true);
    await expectSharpCanvas();
    await tapBuilding(page, "armory");
    await expect(page.getByTestId("building-panel")).toHaveAttribute("data-building", "armory");
  });
});

test("a corrupt M1 save falls back to a fresh guest base", async ({ page, request }) => {
  await setTime(page, request, T0);
  await page.addInitScript(() => localStorage.setItem("revolt.save", "{not json"));
  await page.goto("/");
  await waitForGame(page);
  await expect(page.locator('.res[data-resource="food"] .res-amount')).toHaveText("500");
});

const food = (page: Page) => page.locator('.res[data-resource="food"] .res-amount');

const m1Save = (state: object): string => JSON.stringify({ version: 1, state });
const M1_STATE = {
  resources: { food: 1234, materiel: 900, funds: 800, support: 10 },
  levels: { hq: 2, farm: 1, armory: 1, treasury: 1 },
  queue: null,
  lastUpdated: T0,
};

test("an M1 local save is moved into the new guest account once", async ({ page, request }) => {
  await setTime(page, request, T0);
  // Only before the first session exists, like a device upgrading from M1.
  await page.addInitScript((save) => {
    if (localStorage.getItem("revolt.session") === null) localStorage.setItem("revolt.save", save);
  }, m1Save(M1_STATE));
  await page.goto("/");
  await waitForGame(page);
  await expect(food(page)).toHaveText("1,234");
  await tapBuilding(page, "hq");
  await expect(page.getByTestId("building-panel").locator(".panel-level")).toContainText("2");
  expect(await page.evaluate(() => localStorage.getItem("revolt.save"))).toBeNull();
});

test("tampering with local storage has no effect", async ({ page, request }) => {
  await setTime(page, request, T0);
  await page.goto("/");
  await waitForGame(page);
  await expect(food(page)).toHaveText("500");

  // A forged save next to a live session is ignored, and so is a forged queue.
  const rich = { ...M1_STATE, resources: { food: 99999, materiel: 99999, funds: 99999, support: 9999 }, levels: { hq: 10, farm: 10, armory: 10, treasury: 10 } };
  await page.evaluate((save) => localStorage.setItem("revolt.save", save), m1Save(rich));
  await page.reload();
  await waitForGame(page);
  await expect(food(page)).toHaveText("500");
  await tapBuilding(page, "farm");
  await expect(page.getByTestId("upgrade")).toBeDisabled();

  // A request carrying forged numbers changes nothing either.
  const token = await page.evaluate(() => localStorage.getItem("revolt.session"));
  const res = await request.post(`${API}/v1/intent`, {
    headers: { authorization: `Bearer ${token}` },
    data: { type: "upgrade", building: "farm", resources: rich.resources, state: rich },
  });
  expect((await res.json()).ok).toBe(false);
  await page.reload();
  await waitForGame(page);
  await expect(food(page)).toHaveText("500");
});

for (const { locale, lang } of [
  { locale: "en-US", lang: "en" },
  { locale: "ar-DZ", lang: "ar" },
] as const) {
  test.describe(`${lang} account`, () => {
    test.use({ locale });

    test(`a linked Google account loads the same base on a second device (${lang})`, { tag: "@screenshots" }, async ({ page, browser, request }) => {
      const email = `player-${lang}-${Date.now()}@example.com`;
      await setTime(page, request, T0);
      await page.goto("/");
      await waitForGame(page);

      // Device A: upgrade the HQ as a guest, then link Google.
      await tapBuilding(page, "hq");
      await page.getByTestId("upgrade").click();
      await expect(page.getByTestId("countdown")).toBeVisible();
      await page.getByTestId("account").click();
      const panel = page.getByTestId("account-panel");
      await expect(panel).toBeVisible();
      await expect(page.getByTestId("building-panel")).toBeHidden();
      await expectNoRawKeys(page);
      await screenshot(page, `${SHOTS}/${lang}-5-account-guest.png`);
      await page.getByTestId("mock-google-email").fill(email);
      await page.getByTestId("google-sign-in").click();
      await expect(page.getByTestId("account-status")).toContainText(email);
      await expectNoRawKeys(page);
      await screenshot(page, `${SHOTS}/${lang}-6-account-linked.png`);

      // Device B: a fresh phone starts as a new guest, then signs in with the same Google account.
      const other = await browser.newContext({ ...PHONE, locale });
      const pageB = await other.newPage();
      await pageB.clock.setFixedTime(T0);
      await pageB.goto("/");
      await waitForGame(pageB);
      await expect(pageB.locator(".queue-pill")).not.toHaveClass(/busy/);
      await pageB.getByTestId("account").click();
      await pageB.getByTestId("mock-google-email").fill(email);
      await pageB.getByTestId("google-sign-in").click();
      await expect(pageB.getByTestId("account-status")).toContainText(email);
      // The same base: the HQ upgrade started on device A is running here too.
      await expect(pageB.locator(".queue-pill")).toHaveClass(/busy/);
      await expect(food(pageB)).toHaveText("300");
      await pageB.reload();
      await waitForGame(pageB);
      await expect(pageB.locator(".queue-pill")).toHaveClass(/busy/);
      await other.close();
    });
  });
}
