import { expect, test, type Page } from "@playwright/test";

const T0 = new Date("2026-06-01T12:00:00Z").getTime();
const SHOTS = "test-results/screens";

/** Any untranslated i18n key that leaked into the page, e.g. "panel.upgrade". */
const RAW_KEY = /\b(app|resource|building|panel|reason|queue|time|settings|language)\.[a-z_]+\b/;

type BuildingId = "hq" | "farm" | "armory" | "treasury";

const waitForGame = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => window.__revolt !== undefined);
  await page.locator("canvas").waitFor();
  // Let Phaser draw a few frames.
  await page.waitForTimeout(400);
};

const tapBuilding = async (page: Page, id: BuildingId): Promise<void> => {
  const p = await page.evaluate((b) => window.__revolt!.buildingScreenPoint(b), id);
  await page.touchscreen.tap(p.x, p.y);
};

const expectNoRawKeys = async (page: Page): Promise<void> => {
  const text = await page.locator("#ui").innerText();
  expect(text).not.toMatch(RAW_KEY);
};

const LOCALES = [
  { locale: "en-US", lang: "en", dir: "ltr", upgrade: "Upgrade" },
  { locale: "ar-DZ", lang: "ar", dir: "rtl", upgrade: "ترقية" },
  { locale: "fr-FR", lang: "fr", dir: "ltr", upgrade: "Améliorer" },
] as const;

for (const { locale, lang, dir, upgrade } of LOCALES) {
  test.describe(`${lang}`, () => {
    test.use({ locale });

    test(`base, gating, upgrade countdown and completion after restart (${lang})`, async ({ page }) => {
      await page.clock.setFixedTime(T0);
      await page.goto("/");
      await waitForGame(page);

      // Language follows the device; direction mirrors.
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.locator(".res")).toHaveCount(4);
      await expectNoRawKeys(page);
      await page.screenshot({ path: `${SHOTS}/${lang}-1-base.png` });

      // A producer is gated by the HQ level at the start.
      await tapBuilding(page, "farm");
      await expect(page.locator(".panel")).toBeVisible();
      await expect(page.getByTestId("upgrade")).toBeDisabled();
      await expect(page.getByTestId("reason")).toBeVisible();
      await expectNoRawKeys(page);
      await page.screenshot({ path: `${SHOTS}/${lang}-2-farm-gated.png` });

      // Upgrade the HQ: cost is paid and a countdown starts.
      await tapBuilding(page, "hq");
      await expect(page.locator(".panel")).toHaveAttribute("data-building", "hq");
      const button = page.getByTestId("upgrade");
      await expect(button).toHaveText(upgrade);
      await expect(button).toBeEnabled();
      await button.click();
      await expect(page.getByTestId("countdown")).toBeVisible();
      await expect(page.locator('.res[data-resource="food"] .res-amount')).toHaveText("300");
      await expectNoRawKeys(page);
      await page.screenshot({ path: `${SHOTS}/${lang}-3-hq-upgrading.png` });

      // "Close the app" for an hour: the upgrade completes and resources accrue.
      const saved = await page.evaluate(() => localStorage.getItem("revolt.save"));
      expect(saved).toContain('"queue":{"building":"hq"');
      await page.clock.setFixedTime(T0 + 60 * 60 * 1000);
      await page.reload();
      await waitForGame(page);
      // 300 + 120/h for 1 h.
      await expect(page.locator('.res[data-resource="food"] .res-amount')).toHaveText("420");
      await tapBuilding(page, "hq");
      await expect(page.locator(".panel-level")).toContainText("2");
      await expect(page.getByTestId("countdown")).toHaveCount(0);
      await expect(page.locator(".queue-pill")).not.toHaveClass(/busy/);

      // Now the farm can be upgraded.
      await tapBuilding(page, "farm");
      await expect(page.getByTestId("upgrade")).toBeEnabled();
      await page.screenshot({ path: `${SHOTS}/${lang}-4-after-restart.png` });
    });
  });
}

test("language switcher changes language and direction, and is remembered", async ({ page }) => {
  await page.clock.setFixedTime(T0);
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
  await expect(page.locator(".panel")).toHaveAttribute("data-building", "armory");
});

test("a corrupt save falls back to a fresh base", async ({ page }) => {
  await page.clock.setFixedTime(T0);
  await page.addInitScript(() => localStorage.setItem("revolt.save", "{not json"));
  await page.goto("/");
  await waitForGame(page);
  await expect(page.locator('.res[data-resource="food"] .res-amount')).toHaveText("500");
});
