import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { seededRng } from "@revolt/rules";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { handle } from "../src/app.ts";
import { sqliteDb } from "./sqlite-db.ts";
import type { Db } from "../src/db/db.ts";
import { DEFAULT_SERVER } from "../src/db/accounts.ts";
import type { Env } from "../src/env.ts";
import { ChatRoom } from "../src/alliance/chat-room.ts";
import { RoomHost, type RoomSocket } from "../src/alliance/room-host.ts";
import type { RoomApi } from "../src/alliance/room-client.ts";
import type { MapApi } from "../src/map/map-client.ts";
import { MapHost } from "../src/map/map-host.ts";
import { localBilling } from "../src/billing/local-billing.ts";
import { type BillingVerifier } from "../src/billing/billing.ts";
import { noAnalytics, noCrashReporter, type Analytics, type CrashReporter } from "../src/telemetry.ts";
import { MapService, type MapOp } from "../src/map/map-service.ts";
import type { MapSql } from "../src/map/map-sql.ts";

export const T0 = Date.UTC(2026, 9, 1, 12);
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const CLIENT_ID = "test-web-client-id";

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, MIGRATIONS_DIR), "utf8"));

/** D1's exec() splits on newlines, so apply the migrations, in order, statement by statement. */
const migrate = async (db: Db): Promise<void> => {
  const stmts = MIGRATIONS.join(";\n")
    .replace(/--.*$/gm, "")
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

/** A connected map client in tests: it records what the map pushes. */
export interface TestSocket {
  readonly accountId: string;
  readonly received: Json[];
  open: boolean;
}

/**
 * One server's map as the Durable Object would run it: the same MapService and MapHost,
 * on `node:sqlite` instead of DO storage, with fake sockets and an alarm the test fires.
 */
export interface TestMap {
  readonly host: MapHost;
  readonly sql: MapSql;
  readonly sockets: TestSocket[];
  /** Real time the host asked to be woken at, or null. */
  alarmAt: number | null;
}

const createTestMap = (db: Db, seed: number): TestMap => {
  const sqlite = new DatabaseSync(":memory:");
  const sql: MapSql = { exec: (q, ...b) => sqlite.prepare(q).all(...b) as never };
  let n = 0;
  const service = new MapService({ sql, db, random: seededRng(seed), newId: () => `id-${++n}` });
  const tm: TestMap = {
    sql,
    sockets: [],
    alarmAt: null,
    host: new MapHost(service, {
      sockets: () =>
        tm.sockets
          .filter((s) => s.open)
          .map((s) => ({ accountId: s.accountId, send: (d: string) => void s.received.push(JSON.parse(d)) })),
      setAlarm: async (at) => {
        tm.alarmAt = at;
      },
      // Real time equals game time in these tests.
      realNow: () => 0,
    }),
  };
  return tm;
};

/** The Worker's view of a test map, mirroring `WorldMap`'s RPC methods. */
export const testMapApi = (tm: TestMap, server: string): MapApi => {
  const run = <T>(now: number, op: (s: MapService) => MapOp<T> | Promise<MapOp<T>>): Promise<T> =>
    tm.host.run(now, (s) => {
      s.rememberName(server);
      return op(s);
    });
  return {
    view: (v, now) => run(now, (s) => s.view(v, now)),
    sendMarch: (v, npcId, troops, heroes, now) => run(now, (s) => s.sendMarch(v, npcId, troops, heroes, now)),
    startRally: (v, npcId, troops, gatherMs, now) => run(now, (s) => s.startRally(v, npcId, troops, gatherMs, now)),
    joinRally: (v, rallyId, troops, now) => run(now, (s) => s.joinRally(v, rallyId, troops, now)),
    setHq: (v, x, y, now) => run(now, (s) => s.setHq(v, x, y, now)),
    hqOf: async (allianceId) => tm.host.service.hqOf(allianceId),
    hqAllianceIds: async () => tm.host.service.hqAllianceIds(),
    setAlliance: (v, now) => run(now, (s) => s.setAlliance(v)).then(() => undefined),
    removeAlliance: (allianceId, now) => run(now, (s) => s.removeAlliance(allianceId)).then(() => undefined),
    removeAccounts: (ids, now) => run(now, (s) => s.removeAccounts(ids)),
    connect: async (_req, v, now) => {
      const socket: TestSocket = { accountId: v.accountId, received: [], open: true };
      tm.sockets.push(socket);
      const snapshot = await run(now, (s) => s.view(v, now));
      socket.received.push({ type: "map", snapshot });
      // Node cannot build a 101; tests read the socket from `server.map().sockets`.
      return new Response(null, { status: 200, headers: { "x-test-socket": String(tm.sockets.length - 1) } });
    },
  };
};

/** A connected chat client in tests: it records what the room pushes. */
export interface TestRoomSocket extends RoomSocket {
  readonly received: Json[];
  open: boolean;
  closeCode: number | null;
}

/** One alliance's chat room as the Durable Object runs it: the same ChatRoom and RoomHost, on `node:sqlite`. */
export interface TestRoom {
  readonly host: RoomHost;
  readonly sockets: TestRoomSocket[];
  readonly sql: MapSql;
  /** Types the room was told about with `notify`. */
  readonly notices: string[];
  disbanded: boolean;
}

const createTestRoom = (): TestRoom => {
  const sqlite = new DatabaseSync(":memory:");
  const sql: MapSql = { exec: (q, ...b) => sqlite.prepare(q).all(...b) as never };
  const room: TestRoom = {
    sql,
    sockets: [],
    notices: [],
    disbanded: false,
    host: new RoomHost(new ChatRoom(sql), { sockets: () => room.sockets.filter((s) => s.open), persist: () => undefined }),
  };
  return room;
};

const testRoomApi = (room: TestRoom): RoomApi => ({
  connect: async (_req, who) => {
    const socket: TestRoomSocket = {
      accountId: who.accountId,
      handle: who.handle,
      rank: who.rank,
      received: [],
      open: true,
      closeCode: null,
      send: (d) => {
        if (!socket.open) throw new Error("closed");
        socket.received.push(JSON.parse(d));
      },
      close: (code) => {
        socket.open = false;
        socket.closeCode = code;
      },
    };
    room.sockets.push(socket);
    room.host.welcome(socket);
    return new Response(null, { status: 200, headers: { "x-test-socket": String(room.sockets.length - 1) } });
  },
  memberChanged: async (accountId, rank) => room.host.memberChanged(accountId, rank),
  notify: async (type) => {
    room.notices.push(type);
    room.host.broadcast({ type });
  },
  disband: async () => {
    room.disbanded = true;
    room.host.disband();
  },
});

export interface Server {
  /** Server clock, ms. Tests move it; clients never send time. */
  now: number;
  readonly google: Keypair;
  readonly env: Env;
  readonly request: (method: string, path: string, opts?: { token?: string; body?: unknown; raw?: string; origin?: string; ip?: string; headers?: Record<string, string> }) => Promise<Response>;
  /** A valid Google ID token for `sub` at the current server time. */
  readonly idToken: (sub: string, email?: string, overrides?: Partial<IdTokenClaims>) => Promise<string>;
  readonly dispose: () => Promise<void>;
  /** The map of a server (default: Algeria), created on first use. */
  readonly map: (name?: string) => TestMap;
  /** The chat room of an alliance, created on first use. */
  readonly room: (allianceId: string) => TestRoom;
  /** Fires the map's alarm at the current server time, as the Durable Object would. */
  readonly fireAlarm: (name?: string) => Promise<void>;
  /** Seed for the maps' random source (placement, tags, battle seeds). */
  mapSeed: number;
  /** The receipt verifier: the local test one by default; tests may swap it. */
  billing: BillingVerifier;
  analytics: Analytics;
  crash: CrashReporter;
}

/** Real D1 in workerd (slow: ~40 ms a query), or the same SQLite in-process. */
const openDb = async (miniflare: boolean): Promise<{ db: Db; dispose: () => Promise<void> }> => {
  if (!miniflare) {
    const { db, close } = sqliteDb();
    return { db, dispose: async () => close() };
  }
  const mf = new Miniflare(
    convertV4MiniflareOptions({ modules: true, script: "export default { fetch: () => new Response('') }", d1Databases: ["DB"] }),
  );
  // Miniflare's D1 type is its own copy of the Workers one; it fits our Db slice structurally.
  const db = (await mf.getD1Database("DB")) as unknown as Db;
  return { db, dispose: () => mf.dispose() };
};

/** `miniflare: true` runs on real D1; only `miniflare-smoke.test.ts` needs it. */
export const startServer = async (envOverrides: Partial<Env> = {}, opts: { miniflare?: boolean } = {}): Promise<Server> => {
  const { db, dispose } = await openDb(opts.miniflare ?? false);
  await migrate(db);
  const google = await keypair("google-1");
  // The DO namespace is never reached in Node tests: `deps.map` stands in for it.
  const noNamespace = { idFromName: () => { throw new Error("no DO in tests"); }, get: () => { throw new Error("no DO in tests"); } };
  const env: Env = { DB: db, WORLD_MAP: noNamespace, ALLIANCE_ROOM: noNamespace, GOOGLE_CLIENT_IDS: CLIENT_ID, ALLOWED_ORIGINS: "http://localhost:4173", ...envOverrides };
  const maps = new Map<string, TestMap>();
  const rooms = new Map<string, TestRoom>();
  const server: Server = {
    now: T0,
    google,
    env,
    request: (method, path, opts = {}) => {
      const headers = new Headers();
      if (opts.token !== undefined) headers.set("authorization", `Bearer ${opts.token}`);
      if (opts.origin !== undefined) headers.set("origin", opts.origin);
      if (opts.ip !== undefined) headers.set("cf-connecting-ip", opts.ip);
      const body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
      if (opts.headers !== undefined) for (const [k, v] of Object.entries(opts.headers)) headers.set(k, v);
      return handle(new Request(`http://api.test${path}`, { method, headers, body }), env, {
        now: () => server.now,
        googleKeys: createLocalJWKSet({ keys: [google.jwk] }),
        map: (_env, name) => testMapApi(server.map(name), name),
        room: (_env, allianceId) => testRoomApi(server.room(allianceId)),
        billing: () => server.billing,
        analytics: server.analytics,
        crash: server.crash,
      });
    },
    idToken: (sub, email, overrides = {}) => {
      const t = Math.floor(server.now / 1000);
      return signIdToken(google, { sub, email, iat: t, exp: t + 3600, ...overrides });
    },
    dispose,
    mapSeed: 1,
    billing: localBilling,
    analytics: noAnalytics,
    crash: noCrashReporter,
    map: (name = DEFAULT_SERVER) => {
      let tm = maps.get(name);
      if (tm === undefined) {
        tm = createTestMap(db, server.mapSeed);
        maps.set(name, tm);
      }
      return tm;
    },
    room: (allianceId) => {
      let r = rooms.get(allianceId);
      if (r === undefined) {
        r = createTestRoom();
        rooms.set(allianceId, r);
      }
      return r;
    },
    fireAlarm: (name) => server.map(name).host.wake(server.now),
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
