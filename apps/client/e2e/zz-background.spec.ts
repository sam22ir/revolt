import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { API, expectNoRawKeys, gotoGame, mapEpoch, openMap, PHONE, screenshot, setTime, SHOTS } from "./helpers.ts";

// Runs after every other spec (file names sort in order): the Vietnam map and the Algeria map both move to this time,
// so it must come after the other specs' slots. See `mapEpoch`.
const FIRST_SLOT = 22;

const LOCALES = [
  { locale: "en-US", lang: "en", dir: "ltr", farm: "Rice paddies", food: "Rice" },
  { locale: "ar-DZ", lang: "ar", dir: "rtl", farm: "حقول الأرز", food: "الأرز" },
] as const;

const MINUTE = 60_000;

const stateOf = async (request: APIRequestContext, page: Page): Promise<Record<string, any>> => {
  const token = await page.evaluate(() => localStorage.getItem("revolt.session") ?? "");
  return (await request.get(`${API}/v1/state`, { headers: { authorization: `Bearer ${token}` } })).json();
};

for (const [i, { locale, lang, dir, farm, food }] of LOCALES.entries()) {
  test(`a new player picks Vietnam, sees its names and story, claims a chapter and keeps it on reload (${lang})`, { tag: "@screenshots" }, async ({ browser, request }) => {
    test.setTimeout(240_000);
    const t0 = mapEpoch(FIRST_SLOT + i);
    await setTime([], request, t0);
    const context = await browser.newContext({ ...PHONE, locale, baseURL: "http://localhost:4173" });
    const a = await context.newPage();
    await a.clock.setFixedTime(t0);

    // First launch: the picker comes before any account exists.
    await a.goto("/");
    await expect(a.getByTestId("background-picker")).toBeVisible();
    await expect(a.locator("html")).toHaveAttribute("dir", dir);
    await expect(a.getByTestId("background-pick-algeria")).toBeVisible();
    await expect(a.getByTestId("background-returning")).toBeVisible();
    await expectNoRawKeys(a);
    await a.screenshot({ path: `${SHOTS}/${lang}-m6-0-picker.png` });
    expect(await a.evaluate(() => localStorage.getItem("revolt.session"))).toBeNull();

    // The choice is permanent, so it asks first; cancelling keeps the picker.
    await a.getByTestId("background-pick-vietnam").click();
    await expect(a.getByTestId("confirm-text")).toBeVisible();
    await a.getByTestId("confirm-no").click();
    await expect(a.getByTestId("background-picker")).toBeVisible();
    expect(await a.evaluate(() => localStorage.getItem("revolt.session"))).toBeNull();
    await gotoGame(a, "vietnam");
    await expect(a.getByTestId("background-picker")).toHaveCount(0);

    // The account is a Vietnam one, and the base shows Vietnam's names for the shared ids.
    expect((await stateOf(request, a)).account.background).toBe("vietnam");
    await expect(a.locator('.res[data-resource="food"]')).toHaveAttribute("title", food);
    const p = await a.evaluate(() => window.__revolt!.buildingScreenPoint("farm"));
    await a.touchscreen.tap(p.x, p.y);
    await expect(a.getByTestId("building-panel")).toHaveAttribute("data-building", "farm");
    await expect(a.getByTestId("building-panel").locator(".panel-title")).toHaveText(farm);
    await expectNoRawKeys(a);
    await a.getByTestId("building-panel").locator(".panel-close").click();

    // Its own heroes, and its own chapter text, still marked as a draft.
    await a.getByTestId("heroes-open").click();
    await expect(a.getByTestId("hero-card")).toHaveCount(4);
    await expect(a.locator('[data-testid="hero-card"][data-hero="trail_scout"]')).toBeVisible();
    await expect(a.locator('[data-testid="hero-card"][data-hero="mountain_guide"]')).toHaveCount(0);
    await expectNoRawKeys(a);
    await a.getByTestId("heroes-panel").locator(".panel-close").click();
    await a.getByTestId("story-open").click();
    await expect(a.getByTestId("story-draft")).toBeVisible();
    await expect(a.getByTestId("story-scene")).toContainText(lang === "ar" ? "مسودة" : "Draft");
    await expectNoRawKeys(a);
    await screenshot(a, `${SHOTS}/${lang}-m6-1-vietnam-story.png`);
    await a.getByTestId("story-panel").locator(".panel-close").click();

    // Chapter 1 from the start: raise the command post, then claim. The reward is a Vietnam hero's shards.
    const hq = await a.evaluate(() => window.__revolt!.buildingScreenPoint("hq"));
    await a.touchscreen.tap(hq.x, hq.y);
    await a.getByTestId("upgrade").click();
    await a.getByTestId("building-panel").locator(".panel-close").click();
    await setTime([a], request, t0 + MINUTE);
    await a.getByTestId("story-open").click();
    await expect(a.getByTestId("story-claim")).toBeEnabled();
    await a.getByTestId("story-claim").click();
    await expect.poll(async () => (await stateOf(request, a)).state.story.chapter).toBe(1);
    const claimed = (await stateOf(request, a)).state;
    expect(claimed.story.chapter).toBe(1);

    // Reloading keeps the account and the background: no picker, same names, and the map is Vietnam's own.
    await a.reload();
    await expect(a.getByTestId("background-picker")).toHaveCount(0);
    await a.waitForFunction(() => window.__revolt !== undefined);
    expect((await stateOf(request, a)).account.background).toBe("vietnam");
    await openMap(a, 1);
    expect(await a.evaluate(() => window.__revolt!.map.snapshot()!.map)).toBe("vietnam-1");
    await context.close();
  });
}
