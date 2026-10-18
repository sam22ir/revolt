/**
 * Entry for local end-to-end tests only (wrangler.e2e.jsonc). It wraps the real
 * API with a settable clock and a fake Google issuer. Being a separate entry
 * module, none of this can end up in the deployed Worker (wrangler.jsonc).
 */
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { handle } from "./app.ts";
import { GOOGLE_ISSUERS } from "./auth/google.ts";
import { csv, type Deps, type Env } from "./env.ts";
import { json, withCors } from "./http.ts";

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
  googleKeys: async (header, token) => createLocalJWKSet({ keys: [(await mockIssuer()).jwk] })(header, token),
};

/** POST /__test/clock `{ now: number | null }` — null returns to real time. */
const setClock = async (req: Request): Promise<Response> => {
  const body: unknown = await req.json();
  const v = typeof body === "object" && body !== null && "now" in body ? body.now : undefined;
  if (v !== null && typeof v !== "number") return json({ error: "bad_request" }, 400);
  fixedNow = v;
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

export default {
  fetch: async (req: Request, env: Env): Promise<Response> => {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/__test/clock") return setClock(req);
    if (req.method === "GET" && url.pathname === "/__test/google-token") return withCors(req, env, await googleToken(url, env));
    return handle(req, env, deps);
  },
};
