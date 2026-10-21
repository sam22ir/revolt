import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { API, expectNoRawKeys, mapEpoch, openGame, openMap, screenshot, setTime, SHOTS, tapTile } from "./helpers.ts";

const LOCALES = [
  { locale: "en-US", lang: "en", dir: "ltr" },
  { locale: "ar-DZ", lang: "ar", dir: "rtl" },
] as const;

type BuildingId = "hq" | "barracks" | "hero_hall";

// After the alliance and base specs' slots, before the world-map spec's (files run in name order).
const FIRST_SLOT = 3;

const MINUTE = 60_000;

const token = (page: Page): Promise<string> => page.evaluate(() => localStorage.getItem("revolt.session") ?? "");

const stateOf = async (request: APIRequestContext, page: Page): Promise<Record<string, any>> =>
  (await (await request.get(`${API}/v1/state`, { headers: { authorization: `Bearer ${await token(page)}` } })).json()).state;

/** Like a player: an open panel covers part of the base, so close it before tapping the next building. */
const tapBuilding = async (page: Page, id: BuildingId): Promise<void> => {
  const panel = page.getByTestId("building-panel");
  if (await panel.isVisible()) await panel.locator(".panel-close").click();
  const p = await page.evaluate((b) => window.__revolt!.buildingScreenPoint(b), id);
  await page.touchscreen.tap(p.x, p.y);
};

const closePanel = async (page: Page, testid: string): Promise<void> => {
  await page.getByTestId(testid).locator(".panel-close").click();
  await expect(page.getByTestId(testid)).toBeHidden();
};

for (const [i, { locale, lang, dir }] of LOCALES.entries()) {
  test(`the hero hall opens the heroes panel, and the story always says it is a draft (${lang})`, async ({ browser, request }) => {
    const t0 = mapEpoch(FIRST_SLOT + i);
    await setTime([], request, t0);
    const a = await openGame(browser, locale, t0);
    await expect(a.locator("html")).toHaveAttribute("dir", dir);

    // The hero hall is a building like the others.
    await tapBuilding(a, "hero_hall");
    await expect(a.getByTestId("building-panel")).toHaveAttribute("data-building", "hero_hall");
    await a.getByTestId("heroes-from-hall").click();
    await expect(a.getByTestId("heroes-panel")).toBeVisible();
    await expect(a.getByTestId("building-panel")).toBeHidden();
    await expect(a.getByTestId("hero-card")).toHaveCount(4);
    // The hero hall is still level 1, so the recruit draw is off with a reason.
    await expect(a.getByTestId("hero-recruit")).toBeDisabled();
    await expect(a.getByTestId("hero-reason")).toBeVisible();
    await expectNoRawKeys(a);

    // Opening the story closes the heroes panel; the draft notice is always there and nothing can be claimed yet.
    await a.getByTestId("story-open").click();
    await expect(a.getByTestId("story-panel")).toBeVisible();
    await expect(a.getByTestId("heroes-panel")).toBeHidden();
    await expect(a.getByTestId("story-draft")).toBeVisible();
    await expect(a.getByTestId("story-scene")).not.toBeEmpty();
    await expect(a.getByTestId("story-claim")).toBeDisabled();
    await expect(a.getByTestId("story-badge")).toBeHidden();
    await a.getByTestId("story-next").click();
    await expect(a.getByTestId("story-next")).toBeDisabled();
    await expectNoRawKeys(a);
    await a.context().close();
  });
}

for (const [i, { locale, lang, dir }] of LOCALES.entries()) {
  test(`story chapters, recruiting, levelling and a march led by a hero (${lang})`, { tag: "@screenshots" }, async ({ browser, request }) => {
    test.setTimeout(360_000);
    const t0 = mapEpoch(FIRST_SLOT + 2 + i);
    await setTime([], request, t0);
    const a = await openGame(browser, locale, t0);
    await expect(a.locator("html")).toHaveAttribute("dir", dir);
    await screenshot(a, `${SHOTS}/${lang}-m5-0-base-with-hero-hall.png`);

    // Chapter 1: raise the command post (60 s on the server clock).
    await tapBuilding(a, "hq");
    await a.getByTestId("upgrade").click();
    await closePanel(a, "building-panel");
    await setTime([a], request, t0 + MINUTE);
    await expect(a.getByTestId("story-badge")).toBeVisible();
    await a.getByTestId("story-open").click();
    await expect(a.getByTestId("story-claim")).toBeEnabled();
    await expectNoRawKeys(a);
    await screenshot(a, `${SHOTS}/${lang}-m5-1-story-ready.png`);
    await a.getByTestId("story-claim").click();
    await expect.poll(async () => (await stateOf(request, a)).story.chapter).toBe(1);
    await expect(a.getByTestId("story-badge")).toBeHidden();

    // Chapter 1 paid funds: raise the hero hall to level 2 (90 s), which opens the recruit draw.
    await closePanel(a, "story-panel");
    await tapBuilding(a, "hero_hall");
    await a.getByTestId("upgrade").click();
    await closePanel(a, "building-panel");
    await setTime([a], request, t0 + 3 * MINUTE);
    await a.getByTestId("heroes-open").click();
    await expect(a.getByTestId("story-panel")).toBeHidden();
    await expect(a.getByTestId("hero-recruit")).toBeEnabled();
    await a.getByTestId("hero-recruit").click();
    await expect(a.getByTestId("hero-drawn")).toBeVisible();
    const drawn = a.locator('[data-testid="hero-card"][data-state="recruited"]').first();
    await expect(drawn).toBeVisible();
    const heroId = (await drawn.getAttribute("data-hero"))!;
    await expect.poll(async () => (await stateOf(request, a)).heroes.owned[heroId]?.level).toBe(1);
    await expectNoRawKeys(a);
    await screenshot(a, `${SHOTS}/${lang}-m5-2-heroes.png`);
    await closePanel(a, "heroes-panel");

    // Chapter 2 also needs 20 troops: train ten more infantry.
    await tapBuilding(a, "barracks");
    await expect(a.getByTestId("training")).toBeVisible();
    await a.getByTestId("troop-select").selectOption("infantry");
    await a.getByTestId("train-count").fill("10");
    await a.getByTestId("train-submit").scrollIntoViewIfNeeded();
    await a.getByTestId("train-submit").click();
    await expect(a.getByTestId("training-batch")).toBeVisible();
    await closePanel(a, "building-panel");
    await setTime([a], request, t0 + 10 * MINUTE);
    await expect(a.getByTestId("story-badge")).toBeVisible();
    await a.getByTestId("story-open").click();
    await a.getByTestId("story-claim").click();
    await expect.poll(async () => (await stateOf(request, a)).story.chapter).toBe(2);
    await closePanel(a, "story-panel");

    // Chapter 2's shards went to the hero just drawn: level it up.
    await a.getByTestId("heroes-open").click();
    const card = a.locator(`[data-testid="hero-card"][data-hero="${heroId}"]`);
    await card.getByTestId("hero-level-up").click();
    await expect.poll(async () => (await stateOf(request, a)).heroes.owned[heroId]?.level).toBe(2);
    await closePanel(a, "heroes-panel");

    // March against the nearest level-1 target, led by the drawn hero.
    await openMap(a, 1);
    const npc = await a.evaluate(() => {
      const s = window.__revolt!.map!.snapshot()!;
      const me = s.bases.find((x) => x.mine)!;
      return s.npcs.filter((n) => n.level === 1).sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))[0]!;
    });
    await tapTile(a, npc);
    await a.getByTestId("send-march").click();
    await expect(a.getByTestId("march-dialog")).toBeVisible();
    await a.getByTestId("march-count-infantry").fill("20");
    await a.getByTestId("march-hero-0").selectOption(heroId);
    await expect(a.getByTestId("march-hero-bonus")).toBeVisible();
    await expectNoRawKeys(a);
    await screenshot(a, `${SHOTS}/${lang}-m5-3-march-with-hero.png`);
    await a.getByTestId("march-submit").click();
    await expect(a.getByTestId("march-dialog")).toBeHidden();
    await expect(a.getByTestId("march-heroes")).toBeVisible();
    const m = (await stateOf(request, a)).marches[0];
    expect(m.heroes).toEqual({ lead: heroId, deputies: [], levels: { [heroId]: 2 } });

    // Arrival: the report names the hero.
    await setTime([a], request, m.arriveAt);
    await expect(a.getByTestId("report-toast-open")).toBeVisible({ timeout: 15_000 });
    await a.getByTestId("report-toast-open").click();
    await expect(a.getByTestId("report")).toHaveAttribute("data-result", "victory");
    await expect(a.getByTestId("report-heroes")).toBeVisible();
    await expectNoRawKeys(a);
    await screenshot(a, `${SHOTS}/${lang}-m5-4-report-with-hero.png`);
    await closePanel(a, "reports");

    // Home again: the victory counts for the story, and chapter 3 is ready.
    await setTime([a], request, m.returnAt);
    await expect.poll(async () => (await stateOf(request, a)).marches).toEqual([]);
    const home = await stateOf(request, a);
    expect(home.story.victories).toBe(1);
    await expect(a.getByTestId("story-badge")).toBeVisible();
    await a.getByTestId("story-open").click();
    await a.getByTestId("story-claim").click();
    await expect(a.getByTestId("story-complete")).toBeVisible();
    await expect(a.getByTestId("story-draft")).toBeVisible();
    await expectNoRawKeys(a);
    await screenshot(a, `${SHOTS}/${lang}-m5-5-story-complete.png`);
    await a.context().close();
  });
}
