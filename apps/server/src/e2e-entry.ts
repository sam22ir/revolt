/**
 * Entry for local end-to-end tests only (wrangler.e2e.jsonc). It wraps the real
 * API with a settable clock and a fake Google issuer. Being a separate entry
 * module, none of this can end up in the deployed Worker (wrangler.jsonc).
 */
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { handle } from "./app.ts";
import { AllianceRoom } from "./alliance/alliance-room.ts";
import { durableRoom } from "./alliance/room-client.ts";
import { durableMap } from "./map/map-client.ts";
import { WorldMap } from "./map/world-map.ts";
import { GOOGLE_ISSUERS } from "./auth/google.ts";
import { BACKGROUND_SERVER } from "@revolt/rules";
import { csv, type Deps, type Env } from "./env.ts";
import { json, withCors } from "./http.ts";
import { localBilling } from "./billing/local-billing.ts";
import { consoleAnalytics, noCrashReporter } from "./telemetry.ts";

let fixedNow: number | null = null;
const now = (): number => fixedNow ?? Date.now();

interface MockIssuer {
  readonly privateKey: CryptoKey;
  readonly jwk: JWK;
}
let issuer: Promise<MockIssuer> | null = null;
const mockIssuer = (): Promise<MockIssuer> =>
  (issuer ??= (async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    return { privateKey, jwk: { ...(await exportJWK(publicKey)), kid: "mock", alg: "RS256" } };
  })());

const deps: Deps = {
  now,
  map: durableMap,
  room: durableRoom,
  // The test verifier lives only in this entry, which is never deployed (wrangler.jsonc points at index.ts).
  billing: () => localBilling,
  analytics: consoleAnalytics,
  crash: noCrashReporter,
  googleKeys: async (header, token) => createLocalJWKSet({ keys: [(await mockIssuer()).jwk] })(header, token),
};

/** The map with a settable game clock for its alarms. Exported under the class name the e2e config binds. */
class WorldMapE2E extends WorldMap {
  protected override async clock(): Promise<number> {
    return (await this.ctx.storage.get<number>("testNow")) ?? Date.now();
  }

  /** Sets the map's clock and fires its alarm now, so tests exercise alarm → settle → push. */
  async setTestClock(v: number | null): Promise<void> {
    if (v === null) await this.ctx.storage.delete("testNow");
    else await this.ctx.storage.put("testNow", v);
    await this.ctx.storage.setAlarm(Date.now());
  }
}
export { WorldMapE2E as WorldMap, AllianceRoom };

/** POST /__test/clock `{ now: number | null }` — null returns to real time. Moves the Worker's and the map's clocks. */
const setClock = async (req: Request, env: Env): Promise<Response> => {
  const body: unknown = await req.json();
  const v = typeof body === "object" && body !== null && "now" in body ? body.now : undefined;
  if (v !== null && typeof v !== "number") return json({ error: "bad_request" }, 400);
  fixedNow = v;
  // One map per background server.
  for (const server of Object.values(BACKGROUND_SERVER)) {
    const map = env.WORLD_MAP.get(env.WORLD_MAP.idFromName(server) as never) as unknown as Pick<WorldMapE2E, "setTestClock">;
    await map.setTestClock(v);
  }
  return json({ now: now() });
};

/** GET /__test/google-token?sub=&email= — an ID token as Google would sign it, for the mock key. */
const googleToken = async (url: URL, env: Env): Promise<Response> => {
  const sub = url.searchParams.get("sub");
  if (sub === null || sub.length === 0) return json({ error: "bad_request" }, 400);
  const email = url.searchParams.get("email");
  const t = Math.floor(now() / 1000);
  const idToken = await new SignJWT({ email, email_verified: email !== null })
    .setProtectedHeader({ alg: "RS256", kid: "mock" })
    .setIssuer(GOOGLE_ISSUERS[1] ?? "")
    .setAudience(csv(env.GOOGLE_CLIENT_IDS)[0] ?? "")
    .setSubject(sub)
    .setIssuedAt(t)
    .setExpirationTime(t + 3600)
    .sign((await mockIssuer()).privateKey);
  return json({ idToken });
};

/**
 * POST /__test/award `{ accountId, key, points }` — writes one award row (an event or pass score) for the account, so a
 * live-features test can have progress without fighting a dozen battles. It writes the same table battles write.
 */
const award = async (req: Request, env: Env): Promise<Response> => {
  const b: unknown = await req.json();
  const o = typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {};
  if (typeof o.accountId !== "string" || typeof o.key !== "string" || typeof o.points !== "number") return json({ error: "bad_request" }, 400);
  const acc = await env.DB.prepare("SELECT server FROM accounts WHERE id = ?").bind(o.accountId).first<{ server: string }>();
  if (acc === null) return json({ error: "not_found" }, 404);
  await env.DB
    .prepare("INSERT INTO live_awards (march_id, key, account_id, server, points, at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(`test-${crypto.randomUUID()}`, o.key, o.accountId, acc.server, o.points, now())
    .run();
  return json({ ok: true });
};

export default {
  fetch: async (req: Request, env: Env): Promise<Response> => {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/__test/clock") return setClock(req, env);
    if (req.method === "POST" && url.pathname === "/__test/award") return award(req, env);
    if (req.method === "GET" && url.pathname === "/__test/google-token") return withCors(req, env, await googleToken(url, env));
    return handle(req, env, deps);
  },
};
