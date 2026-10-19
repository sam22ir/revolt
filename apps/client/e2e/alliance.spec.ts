import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { terrainAt } from "@revolt/rules";
import { API, expectNoRawKeys, openGame, openMap, setTime, SHOTS, T0, tapTile, type Point } from "./helpers.ts";

const LOCALES = [
  { locale: "en-US", lang: "en", dir: "ltr", name: "Free Lands", say: "Salut, on se retrouve au col", reply: "Understood" },
  { locale: "ar-DZ", lang: "ar", dir: "rtl", name: "الحرية", say: "مرحبا بالجميع، نلتقي عند الممر", reply: "علم" },
] as const;

/** A short unique tag (alliances on a server share one namespace across the whole e2e run). */
const unique = (): string => Date.now().toString(36).slice(-4).toUpperCase();

const token = (page: Page): Promise<string> => page.evaluate(() => localStorage.getItem("revolt.session") ?? "");

const stateOf = async (request: APIRequestContext, page: Page): Promise<Record<string, any>> =>
  (await (await request.get(`${API}/v1/state`, { headers: { authorization: `Bearer ${await token(page)}` } })).json()).state;

const toggleAlliance = (page: Page) => page.getByTestId("alliance-open").click();

for (const { locale, lang, dir, name, say, reply } of LOCALES) {
  test(`found, join, chat, help, HQ and rally across two accounts (${lang})`, async ({ browser, request }) => {
    test.setTimeout(300_000);
    await setTime([], request, T0);
    const a = await openGame(browser, locale);
    const b = await openGame(browser, locale);
    const tag = unique();
    const allianceName = `${name} ${tag}`;
    await expect(a.locator("html")).toHaveAttribute("dir", dir);

    // A founds an alliance and is its leader.
    await toggleAlliance(a);
    await expect(a.getByTestId("alliance-panel")).toBeVisible();
    await a.getByTestId("alliance-name").fill(allianceName);
    await a.getByTestId("alliance-tag").fill(tag);
    await a.screenshot({ path: `${SHOTS}/${lang}-m4-1-found.png` });
    await a.getByTestId("alliance-create").click();
    await expect(a.getByTestId("member")).toHaveCount(1);
    const aHandle = await a.evaluate(() => window.__revolt!.alliance!.snapshot().alliance!.members.find((m) => m.me)!.handle);
    await expectNoRawKeys(a);

    // B finds it by name and joins; A's member list follows live.
    await toggleAlliance(b);
    await b.getByTestId("alliance-search").fill(name);
    await expect(b.getByTestId("alliance-result").filter({ hasText: allianceName })).toHaveCount(1);
    await b.getByTestId("alliance-result").filter({ hasText: allianceName }).getByTestId("alliance-join").click();
    await expect(b.getByTestId("member")).toHaveCount(2);
    await expect(a.getByTestId("member")).toHaveCount(2);
    await expect(a.locator(`[data-testid="member"][data-handle="${aHandle}"]`)).toHaveCount(1);
    await expectNoRawKeys(b);
    await a.screenshot({ path: `${SHOTS}/${lang}-m4-2-members.png` });

    // Chat, live both ways; text is shown as text, with automatic direction.
    for (const p of [a, b]) await p.getByTestId("tab-chat").click();
    await a.getByTestId("chat-input").fill(say);
    await a.getByTestId("chat-send").click();
    await expect(b.getByTestId("chat-message").filter({ hasText: say })).toHaveCount(1);
    await b.getByTestId("chat-input").fill(reply);
    await b.getByTestId("chat-send").click();
    await expect(a.getByTestId("chat-message").filter({ hasText: reply })).toHaveCount(1);
    await expect(a.getByTestId("chat-message").first().locator("[dir=auto]").first()).toBeVisible();
    await a.getByTestId("chat-input").fill("<img src=x onerror=alert(1)>");
    await a.getByTestId("chat-send").click();
    await expect(b.getByTestId("chat-message").filter({ hasText: "<img src=x onerror=alert(1)>" })).toHaveCount(1);
    expect(await b.locator("img").count()).toBe(0);
    await expectNoRawKeys(a);
    await b.screenshot({ path: `${SHOTS}/${lang}-m4-3-chat.png` });

    // A upgrades the command post and asks for help; B helps and the upgrade is done at once.
    await toggleAlliance(a);
    const hq = await a.evaluate(() => window.__revolt!.buildingScreenPoint("hq"));
    await a.touchscreen.tap(hq.x, hq.y);
    await a.getByTestId("upgrade").click();
    await expect(a.getByTestId("help-ask")).toBeVisible();
    await a.getByTestId("help-ask").click();
    await b.getByTestId("tab-help").click();
    await expect(b.getByTestId("help-request")).toHaveCount(1);
    await b.screenshot({ path: `${SHOTS}/${lang}-m4-4-help.png` });
    await b.getByTestId("help-request").getByTestId("help-give").click();
    await expect.poll(async () => (await stateOf(request, a)).queue).toBeNull();
    expect((await stateOf(request, a)).levels.hq).toBe(2);
    await expectNoRawKeys(b);

    // The leader puts the HQ on a free tile; B sees it on the map.
    await openMap(a, 2);
    await openMap(b, 2);
    const snap = await a.evaluate(() => window.__revolt!.map!.snapshot()!);
    let spot: Point | null = null;
    for (let x = 4; x < snap.size - 4 && spot === null; x += 3) {
      for (let y = 4; y < snap.size - 4 && spot === null; y += 3) {
        const clear = [...snap.bases, ...snap.npcs, ...snap.hqs].every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > 3);
        if (clear && terrainAt(snap.terrainSeed, x, y) !== "mountain") spot = { x, y };
      }
    }
    if (spot === null) throw new Error("no free tile");
    await tapTile(a, spot);
    await a.getByTestId("place-hq").click();
    await expect.poll(() => b.evaluate(() => window.__revolt!.map!.snapshot()!.hqs.map((h) => `${h.tag}:${h.x},${h.y}`))).toContain(`${tag}:${spot!.x},${spot!.y}`);
    await tapTile(b, spot);
    await expect(b.getByTestId("tile-panel")).toContainText(tag);
    await b.screenshot({ path: `${SHOTS}/${lang}-m4-5-hq.png` });

    // A calls a rally on the fortified line; B joins; both fight one battle and get a report.
    const npc = snap.npcs.find((n) => n.level === 4)!;
    await tapTile(a, npc);
    await expect(a.getByTestId("rally-needed")).toBeVisible();
    await expect(a.getByTestId("send-march")).toHaveCount(0);
    await a.getByTestId("rally-start").click();
    await expect(a.getByTestId("rally-gather")).toBeVisible();
    await a.getByTestId("march-count-infantry").fill("10");
    await a.screenshot({ path: `${SHOTS}/${lang}-m4-6-rally-start.png` });
    await a.getByTestId("march-submit").click();
    await expect(a.getByTestId("march-dialog")).toBeHidden();

    // Tapping a tile closed B's panel; open it again for the rallies tab.
    if (!(await b.getByTestId("alliance-panel").isVisible())) await toggleAlliance(b);
    await b.getByTestId("tab-rallies").click();
    await expect(b.getByTestId("rally")).toHaveCount(1);
    await b.getByTestId("rally").getByTestId("rally-join").click();
    await b.getByTestId("march-count-infantry").fill("10");
    await b.getByTestId("march-submit").click();
    await expect(b.getByTestId("march-dialog")).toBeHidden();
    await expectNoRawKeys(b);
    await b.screenshot({ path: `${SHOTS}/${lang}-m4-7-rally-joined.png` });

    const march = (await stateOf(request, a)).marches[0];
    expect(march.rallyId).toBeTruthy();
    expect((await stateOf(request, b)).marches[0].rallyId).toBe(march.rallyId);
    expect((await stateOf(request, b)).marches[0].arriveAt).toBe(march.arriveAt);

    await setTime([a, b], request, march.arriveAt);
    for (const p of [a, b]) {
      await expect(p.getByTestId("report-toast-open")).toBeVisible({ timeout: 20_000 });
      await p.getByTestId("report-toast-open").click();
      await expect(p.getByTestId("report")).toBeVisible();
      await expectNoRawKeys(p);
    }
    await b.screenshot({ path: `${SHOTS}/${lang}-m4-8-rally-report.png` });
    const seeds = await Promise.all(
      [a, b].map(async (p) => (await (await request.get(`${API}/v1/reports`, { headers: { authorization: `Bearer ${await token(p)}` } })).json()).reports[0].seed),
    );
    expect(seeds[0]).toBe(seeds[1]);

    await setTime([a, b], request, march.returnAt);
    await expect.poll(async () => (await stateOf(request, b)).marches).toEqual([]);

    await a.context().close();
    await b.context().close();
  });
}
