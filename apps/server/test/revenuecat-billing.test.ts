import { describe, expect, test } from "vitest";
import { BillingNotConfigured, BillingUnavailable } from "../src/billing/billing.ts";
import { revenueCatBilling } from "../src/billing/revenuecat-billing.ts";

const TOKEN = "opaque-play-purchase-token.AO-J1Ox_abc123";
const CTX = { accountId: "acc-1" };

type Call = { url: string; init: RequestInit };

const fakeFetch = (status: number, body: unknown, calls: Call[] = []): typeof fetch =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

const answer = (sku: string, entry: Record<string, unknown>): unknown => ({
  value: { request_date_ms: 1, subscriber: { non_subscriptions: { [sku]: [{ id: "rc1", purchase_date: "2026-11-28T00:00:00Z", ...entry }] } } },
});

const verifier = (f: typeof fetch, allowSandbox = false) => revenueCatBilling({ secret: "sk_test", allowSandbox, fetch: f });

describe("RevenueCat verifier", () => {
  test("without a secret it is not configured and refuses to verify", async () => {
    const v = revenueCatBilling({ secret: undefined, allowSandbox: false });
    expect(v.configured).toBe(false);
    await expect(v.verify("google", "pass_premium", TOKEN, CTX)).rejects.toBeInstanceOf(BillingNotConfigured);
    expect(revenueCatBilling({ secret: "", allowSandbox: false }).configured).toBe(false);
  });

  test("a Play purchase RevenueCat lists for the sku is granted once per purchase token", async () => {
    const calls: Call[] = [];
    const v = verifier(fakeFetch(200, answer("pass_premium", { store: "play_store", is_sandbox: false }), calls));
    const r = await v.verify("google", "pass_premium", TOKEN, CTX);
    expect(r.ok).toBe(true);
    // Same token, same transaction id; another token, another id.
    expect(await v.verify("google", "pass_premium", TOKEN, CTX)).toEqual(r);
    const other = await v.verify("google", "pass_premium", `${TOKEN}x`, CTX);
    expect(other.ok && r.ok && other.txnId !== r.txnId).toBe(true);
  });

  test("it sends the token and sku, never the account id or the token as the transaction id", async () => {
    const calls: Call[] = [];
    const r = await verifier(fakeFetch(200, answer("bundle_small", { store: "play_store" }), calls)).verify("google", "bundle_small", TOKEN, CTX);
    const call = calls[0];
    expect(call?.url).toBe("https://api.revenuecat.com/v1/receipts");
    const headers = new Headers(call?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer sk_test");
    expect(headers.get("x-platform")).toBe("android");
    const body = JSON.parse(String(call?.init.body)) as Record<string, string>;
    expect(body.fetch_token).toBe(TOKEN);
    expect(body.product_id).toBe("bundle_small");
    expect(body.app_user_id).not.toContain("acc-1");
    expect(body.app_user_id).toMatch(/^[0-9a-f]{64}$/);
    expect(r.ok && !r.txnId.includes(TOKEN)).toBe(true);
  });

  test("the answer must list the requested sku, from the Play store", async () => {
    expect(await verifier(fakeFetch(200, answer("bundle_large", { store: "play_store" }))).verify("google", "bundle_small", TOKEN, CTX)).toEqual({ ok: false });
    expect(await verifier(fakeFetch(200, answer("bundle_small", { store: "app_store" }))).verify("google", "bundle_small", TOKEN, CTX)).toEqual({ ok: false });
    expect(await verifier(fakeFetch(200, { value: {} })).verify("google", "bundle_small", TOKEN, CTX)).toEqual({ ok: false });
    expect(await verifier(fakeFetch(200, "nonsense")).verify("google", "bundle_small", TOKEN, CTX)).toEqual({ ok: false });
  });

  test("sandbox purchases count only when the deployment allows them", async () => {
    const f = fakeFetch(200, answer("pass_premium", { store: "play_store", is_sandbox: true }));
    expect(await verifier(f).verify("google", "pass_premium", TOKEN, CTX)).toEqual({ ok: false });
    expect((await verifier(f, true).verify("google", "pass_premium", TOKEN, CTX)).ok).toBe(true);
  });

  test("other providers and malformed tokens are refused without a request", async () => {
    const calls: Call[] = [];
    const v = verifier(fakeFetch(200, answer("pass_premium", { store: "play_store" }), calls));
    expect(await v.verify("local", "pass_premium", "local-test:abcd", CTX)).toEqual({ ok: false });
    expect(await v.verify("google", "pass_premium", "short", CTX)).toEqual({ ok: false });
    expect(await v.verify("google", "pass_premium", "has spaces in it, so no", CTX)).toEqual({ ok: false });
    expect(calls).toHaveLength(0);
  });

  test("a receipt RevenueCat rejects is a bad receipt; outages and a bad key are not", async () => {
    expect(await verifier(fakeFetch(400, { code: 7103 })).verify("google", "pass_premium", TOKEN, CTX)).toEqual({ ok: false });
    await expect(verifier(fakeFetch(503, {})).verify("google", "pass_premium", TOKEN, CTX)).rejects.toBeInstanceOf(BillingUnavailable);
    await expect(verifier(fakeFetch(429, {})).verify("google", "pass_premium", TOKEN, CTX)).rejects.toBeInstanceOf(BillingUnavailable);
    await expect(verifier(fakeFetch(401, {})).verify("google", "pass_premium", TOKEN, CTX)).rejects.toBeInstanceOf(BillingNotConfigured);
    const down = (async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    await expect(verifier(down).verify("google", "pass_premium", TOKEN, CTX)).rejects.toBeInstanceOf(BillingUnavailable);
  });
});
