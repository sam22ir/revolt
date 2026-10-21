import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { eventWindow, passKey, passSeasonAt } from "@revolt/rules";
import { API, expectNoRawKeys, mapEpoch, openGame, screenshot, setTime, SHOTS } from "./helpers.ts";

/*
 * M7: events, rankings, the pass and the store, in en and ar. This file is named zz-live so it runs last: the shared
 * map settles at the latest time it has seen and never goes back, and this spec moves the clock forward by hours.
 * Progress is written through the e2e Worker's /__test/award (the same table battles write); purchases go through the
 * test billing the e2e build is made with (VITE_BILLING_MOCK=1) and the Worker's test receipt verifier.
 */
const LOCALES = [
  { locale: "en-US", lang: "en", dir: "ltr", slot: 40 },
  { locale: "ar-DZ", lang: "ar", dir: "rtl", slot: 50 },
] as const;

const HOUR = 3_600_000;

/** Two hours before the end of the supply-route window at or after the slot's day, so a few hours of clock end it. */
const startTime = (slot: number): { t0: number; window: ReturnType<typeof eventWindow> } => {
  const day = mapEpoch(slot);
  let i = 0;
  while (eventWindow("supply_route", i + 1).startsAt <= day) i++;
  const window = eventWindow("supply_route", i);
  return { t0: Math.max(day, window.endsAt - 2 * HOUR), window };
};

const bearer = (page: Page): Promise<string> => page.evaluate(() => localStorage.getItem("revolt.session") ?? "");

const account = async (request: APIRequestContext, page: Page): Promise<{ id: string; handle: string }> =>
  (await (await request.get(`${API}/v1/state`, { headers: { authorization: `Bearer ${await bearer(page)}` } })).json()).account;

const award = async (request: APIRequestContext, accountId: string, key: string, points: number): Promise<void> => {
  expect((await request.post(`${API}/__test/award`, { data: { accountId, key, points } })).ok()).toBe(true);
};

/** Closes and opens the Live panel, which refreshes it from the server. */
const reopen = async (page: Page): Promise<void> => {
  await page.getByTestId("live-panel").locator(".panel-close").click();
  await expect(page.getByTestId("live-panel")).toBeHidden();
  await page.getByTestId("live-open").click();
  await expect(page.getByTestId("live-panel")).toBeVisible();
};

for (const { locale, lang, dir, slot } of LOCALES) {
  test(`events, rankings, the pass and the store (${lang})`, async ({ browser, request }) => {
    test.setTimeout(240_000);
    const { t0, window } = startTime(slot);
    await setTime([], request, t0);
    const a = await openGame(browser, locale, t0);
    await expect(a.locator("html")).toHaveAttribute("dir", dir);
    const me = await account(request, a);

    // Nothing to claim yet: no badge. The panel opens on the events, with the supply route running and a score of zero.
    await expect(a.getByTestId("live-badge")).toBeHidden();
    await a.getByTestId("live-open").click();
    await expect(a.getByTestId("live-panel")).toBeVisible();
    const card = a.locator('[data-testid="event-card"][data-event="supply_route"][data-state="active"]');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-state", "active");
    await expect(card.getByTestId("event-claim")).toHaveCount(0);
    await expectNoRawKeys(a);

    // Progress arrives: points in the event and enough pass xp for two tiers. The panel shows it after a refresh.
    await award(request, me.id, window.key, 60);
    await award(request, me.id, passKey(passSeasonAt(t0).index), 250);
    await reopen(a);
    await expect(card.getByTestId("event-score")).toContainText("60");
    await expect(a.getByTestId("live-badge")).toBeVisible();

    // Rankings: the player's own row, marked, with the player name; an empty regions board.
    await a.getByTestId("live-tab-board").click();
    // (Players of earlier tests share this server, so other rows may be there too.)
    const mine = a.locator('[data-testid="board-row"][data-mine="true"]');
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText(me.handle);
    await expect(a.getByTestId("board-me")).toBeVisible();
    await a.getByTestId("board-tab-regions").click();
    await expect(a.getByTestId("board-me")).toBeVisible();
    await expect(mine).toHaveCount(0);
    await a.getByTestId("board-tab-power").click();
    await expect(mine).toHaveCount(1);
    await expectNoRawKeys(a);

    // The pass: tiers 1 and 2 are reached; a free tier pays once and then reads as claimed.
    await a.getByTestId("live-tab-pass").click();
    await expect(a.getByTestId("pass-progress")).toBeVisible();
    await expect(a.getByTestId("pass-claim-1-free")).toBeEnabled();
    await expect(a.getByTestId("pass-claim-3-free")).toBeDisabled();
    await expect(a.getByTestId("pass-claim-1-premium")).toBeDisabled();
    await a.getByTestId("pass-claim-1-free").click();
    await expect(a.getByTestId("pass-claim-1-free")).toBeDisabled();
    await expect(a.getByTestId("pass-tier-1").locator(".pass-cell.free")).toHaveAttribute("data-state", "claimed");
    await expect(a.getByTestId("pass-claim-2-free")).toBeEnabled();

    // The store: a fair-play note, and with test billing the premium track can be bought, once.
    await a.getByTestId("live-tab-store").click();
    await expect(a.getByTestId("store-fairnote")).toBeVisible();
    await expect(a.getByTestId("store-unavailable")).toHaveCount(0);
    await expect(a.getByTestId("store-buy-pass_premium")).toBeEnabled();
    await a.getByTestId("store-buy-pass_premium").click();
    await expect(a.getByTestId("store-product-pass_premium")).toHaveAttribute("data-owned", "true");
    await expect(a.getByTestId("store-buy-pass_premium")).toBeDisabled();
    await a.getByTestId("store-buy-speedup_pack_small").click();
    await expect(a.getByTestId("store-wallet")).toContainText("5");
    await expectNoRawKeys(a);
    await a.getByTestId("live-tab-pass").click();
    await expect(a.getByTestId("pass-claim-1-premium")).toBeEnabled();
    await a.getByTestId("pass-claim-1-premium").click();
    await expect(a.getByTestId("pass-claim-1-premium")).toBeDisabled();

    // The event ends: its reward can be taken, once.
    await setTime([a], request, window.endsAt + HOUR / 2);
    await reopen(a);
    await a.getByTestId("live-tab-events").click();
    const ended = a.locator('[data-testid="event-card"][data-event="supply_route"][data-state="ended"]');
    await expect(ended).toBeVisible();
    await expect(ended.getByTestId("event-claim")).toBeEnabled();
    await ended.getByTestId("event-claim").click();
    await expect(ended.getByTestId("event-claim")).toBeDisabled();
    await expectNoRawKeys(a);
    await a.context().close();
  });
}

for (const { locale, lang, slot } of LOCALES) {
  test(`the Live panels on a phone (${lang})`, { tag: "@screenshots" }, async ({ browser, request }) => {
    test.setTimeout(240_000);
    const { t0, window } = startTime(slot + 20);
    await setTime([], request, t0);
    const a = await openGame(browser, locale, t0);
    const me = await account(request, a);
    await award(request, me.id, window.key, 120);
    await award(request, me.id, passKey(passSeasonAt(t0).index), 650);
    await a.getByTestId("live-open").click();
    await expect(a.locator('[data-testid="event-card"][data-event="supply_route"][data-state="active"]').getByTestId("event-score")).toContainText("120");
    await screenshot(a, `${SHOTS}/${lang}-m7-1-events.png`);
    await a.getByTestId("live-tab-board").click();
    await expect(a.locator('[data-testid="board-row"][data-mine="true"]')).toHaveCount(1);
    await screenshot(a, `${SHOTS}/${lang}-m7-2-board.png`);
    await a.getByTestId("live-tab-pass").click();
    await expect(a.getByTestId("pass-progress")).toBeVisible();
    await screenshot(a, `${SHOTS}/${lang}-m7-3-pass.png`);
    await a.getByTestId("live-tab-store").click();
    await expect(a.getByTestId("store-fairnote")).toBeVisible();
    await screenshot(a, `${SHOTS}/${lang}-m7-4-store.png`);
    await a.context().close();
  });
}
