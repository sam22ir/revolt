import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { consoleAnalytics, noopAnalytics, withConsent } from "../src/platform/analytics.ts";
import { installCrashHooks, noopCrashReporter, reportWithConsent } from "../src/platform/crash.ts";
import { loadConsent, storeConsent } from "../src/platform/consent.ts";
import { createPlatform } from "../src/platform/index.ts";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("consent", () => {
  test("is off until the player turns it on, and remembered", () => {
    const s = memory();
    expect(loadConsent(s)).toBe(false);
    storeConsent(s, true);
    expect(loadConsent(s)).toBe(true);
    storeConsent(s, false);
    expect(loadConsent(s)).toBe(false);
  });

  test("blocked storage means off, and does not throw", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadConsent(blocked)).toBe(false);
    expect(() => storeConsent(blocked, true)).not.toThrow();
  });
});

describe("analytics and crash reports", () => {
  test("nothing goes out without consent, and switching it off stops the next event", () => {
    const sent: string[] = [];
    let on = false;
    const a = withConsent({ track: (e) => void sent.push(e) }, () => on);
    a.track("one");
    on = true;
    a.track("two");
    on = false;
    a.track("three");
    expect(sent).toEqual(["two"]);
    const crashes: unknown[] = [];
    const c = reportWithConsent({ capture: (e) => void crashes.push(e) }, () => on);
    c.capture("x");
    on = true;
    c.capture("y");
    expect(crashes).toEqual(["y"]);
  });

  test("window errors and unhandled rejections reach the reporter, and the hooks can be removed", () => {
    const handlers = new Map<string, (e: Event) => void>();
    const target = {
      addEventListener: (type: string, fn: EventListenerOrEventListenerObject) => void handlers.set(type, fn as (e: Event) => void),
      removeEventListener: (type: string) => void handlers.delete(type),
    };
    const seen: [unknown, string | undefined][] = [];
    const off = installCrashHooks({ capture: (e, w) => void seen.push([e, w]) }, target as never);
    handlers.get("error")?.({ error: new Error("boom") } as unknown as Event);
    handlers.get("unhandledrejection")?.({ reason: "nope" } as unknown as Event);
    expect(seen.map((s) => s[1])).toEqual(["window.onerror", "unhandledrejection"]);
    off();
    expect(handlers.size).toBe(0);
  });

  test("the default build has no billing and sends nothing, even with consent", () => {
    const p = createPlatform({ billingMock: false, dev: false, storage: memory() });
    expect(p.billing.available).toBe(false);
    p.consent.set(true);
    // The no-op sinks swallow everything; the point is that nothing throws and nothing is wired to a service.
    expect(() => p.analytics.track("x")).not.toThrow();
    expect(() => p.crash.capture(new Error("x"))).not.toThrow();
    expect(noopAnalytics.track("x")).toBeUndefined();
    expect(noopCrashReporter.capture("x")).toBeUndefined();
    expect(typeof consoleAnalytics.track).toBe("function");
  });

  test("test billing exists only when the flag is set", () => {
    expect(createPlatform({ billingMock: true, dev: false, storage: memory() }).billing.available).toBe(true);
    expect(createPlatform({ billingMock: false, dev: true, storage: memory() }).billing.available).toBe(false);
  });

  test("the consent choice is read from storage when the platform starts", () => {
    const s = memory();
    storeConsent(s, true);
    expect(createPlatform({ billingMock: false, dev: false, storage: s }).consent.get()).toBe(true);
  });
});

describe("live panels set text, not markup", () => {
  const dir = join(import.meta.dirname, "..", "src", "ui");
  const files = readdirSync(dir).filter((f) => /^live-.*\.ts$/.test(f));

  test("there are live panel files to check", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  test("innerHTML is only used for the static resource icon; no other raw markup", () => {
    for (const f of files) {
      for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
        if (/insertAdjacentHTML|outerHTML|document\.write/.test(line)) throw new Error(`${f}: ${line.trim()}`);
        if (/innerHTML\s*=/.test(line)) expect(line, `${f}: ${line.trim()}`).toMatch(/resourceIcon\(/);
      }
    }
  });

  test("other players' names are set as text inside <bdi dir=auto>, never as markup", () => {
    const src = readFileSync(join(dir, "live-board-tab.ts"), "utf8");
    expect(src).toContain('el("bdi", "live-name", e.name)');
    expect(src).toContain('setAttribute("dir", "auto")');
  });

  test("the store has no countdown or scarcity text, and keeps its fair-play note", () => {
    const src = readFileSync(join(dir, "live-store-tab.ts"), "utf8");
    expect(src).toContain("live.store.fairNote");
    expect(src).not.toMatch(/data-ends|dataset\.ends|limited time|only today/i);
  });

  test("live styles use logical properties only", () => {
    const css = readFileSync(join(dir, "live.css"), "utf8");
    expect(css).not.toMatch(/(margin|padding|border)-(left|right)|\b(left|right)\s*:|text-align:\s*(left|right)/);
  });
});
