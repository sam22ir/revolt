import { readFileSync } from "node:fs";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { handle } from "../src/app.ts";
import type { Db } from "../src/db/db.ts";
import type { Env } from "../src/env.ts";

export const T0 = Date.UTC(2026, 9, 1, 12);
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const CLIENT_ID = "test-web-client-id";

const MIGRATION = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

/** D1's exec() splits on newlines, so apply the migration statement by statement. */
const migrate = async (db: Db): Promise<void> => {
  const stmts = MIGRATION.replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await db.batch(stmts.map((s) => db.prepare(s)));
};

export interface Keypair {
  readonly privateKey: CryptoKey;
  readonly jwk: JWK;
}

export const keypair = async (kid: string): Promise<Keypair> => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  return { privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: "RS256" } };
};

export interface IdTokenClaims {
  sub: string;
  email?: string;
  aud?: string;
  iss?: string;
  /** Seconds. */
  iat?: number;
  exp?: number;
}

export const signIdToken = (key: Keypair, c: IdTokenClaims): Promise<string> =>
  new SignJWT({ email: c.email, email_verified: c.email !== undefined })
    .setProtectedHeader({ alg: "RS256", kid: key.jwk.kid ?? "" })
    .setIssuer(c.iss ?? "https://accounts.google.com")
    .setAudience(c.aud ?? CLIENT_ID)
    .setSubject(c.sub)
    .setIssuedAt(c.iat ?? 0)
    .setExpirationTime(c.exp ?? 0)
    .sign(key.privateKey);

export interface Server {
  /** Server clock, ms. Tests move it; clients never send time. */
  now: number;
  readonly google: Keypair;
  readonly env: Env;
  readonly request: (method: string, path: string, opts?: { token?: string; body?: unknown; raw?: string; origin?: string }) => Promise<Response>;
  /** A valid Google ID token for `sub` at the current server time. */
  readonly idToken: (sub: string, email?: string, overrides?: Partial<IdTokenClaims>) => Promise<string>;
  readonly dispose: () => Promise<void>;
}

export const startServer = async (envOverrides: Partial<Env> = {}): Promise<Server> => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({ modules: true, script: "export default { fetch: () => new Response('') }", d1Databases: ["DB"] }),
  );
  // Miniflare's D1 type is its own copy of the Workers one; it fits our Db slice structurally.
  const db = (await mf.getD1Database("DB")) as unknown as Db;
  await migrate(db);
  const google = await keypair("google-1");
  const env: Env = { DB: db, GOOGLE_CLIENT_IDS: CLIENT_ID, ALLOWED_ORIGINS: "http://localhost:4173", ...envOverrides };
  const server: Server = {
    now: T0,
    google,
    env,
    request: (method, path, opts = {}) => {
      const headers = new Headers();
      if (opts.token !== undefined) headers.set("authorization", `Bearer ${opts.token}`);
      if (opts.origin !== undefined) headers.set("origin", opts.origin);
      const body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
      return handle(new Request(`http://api.test${path}`, { method, headers, body }), env, {
        now: () => server.now,
        googleKeys: createLocalJWKSet({ keys: [google.jwk] }),
      });
    },
    idToken: (sub, email, overrides = {}) => {
      const t = Math.floor(server.now / 1000);
      return signIdToken(google, { sub, email, iat: t, exp: t + 3600, ...overrides });
    },
    dispose: () => mf.dispose(),
  };
  return server;
};

/** Response body as loose JSON; tests assert on its shape. */
// `any` because tests reach deep into JSON responses; asserting the shape is the test's job.
export type Json = any;
export const body = async (res: Response): Promise<Json> => res.json();

export interface Device {
  token: string;
}

export const newGuest = async (server: Server, importSave?: unknown): Promise<Device & { res: Json }> => {
  const res = await body(await server.request("POST", "/v1/guest", { body: importSave === undefined ? {} : { importSave } }));
  return { token: res.token as string, res };
};
