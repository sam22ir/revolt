# Game server: local development (M2, M3)

The server is a Cloudflare Worker in `apps/server` with a D1 database. Everything here runs on this machine; nothing creates Cloudflare resources or deploys.

## Run it

```bash
pnpm --filter @revolt/server db:migrate:local
```

```bash
pnpm --filter @revolt/server dev
```

The first command creates the local D1 database (under `apps/server/.wrangler/`) and applies `migrations/`. The second serves the API on `http://localhost:8787`. Then run the client as before (`pnpm dev`); it talks to port 8787 on the host it was loaded from, or to `VITE_API_URL` if set.

To try Google linking without a Google client ID, run the mock config instead. It adds a settable clock and a fake Google issuer on the same port 8787, and must never be deployed:

```bash
pnpm --filter @revolt/server dev:mock
```

and start the client with `VITE_GOOGLE_MOCK=1 pnpm dev`. The account panel then shows a "test Google account" email field.

## API

All JSON. The device sends `Authorization: Bearer <token>`; every answer carries the server's `now` (epoch ms).

| Route | Body | Answer |
| --- | --- | --- |
| `POST /v1/guest` | `{ importSave? }` (a pre-M2 local save, imported once, bounded) | `{ token, account, state, now, imported }` |
| `GET /v1/state` | | `{ account, state, now }` — state computed at server time |
| `POST /v1/intent` | `{ type: "upgrade", building }` | `{ ok, reason?, state, now }` |
| `POST /v1/auth/google` | `{ idToken }` | `{ token, account, state, now, switched }` |
| `POST /v1/logout` | | `{ ok, now }` — this device's session ends; other devices stay signed in |
| `POST /v1/intent` | `{ type: "train", troop, count }` | `{ ok, reason?, state, now }` — one barracks batch |
| `POST /v1/intent` | `{ type: "march", target, troops }` | `{ ok, reason?, state, now }` — `target` is an NPC id from the map; reasons `no_troops`, `not_enough_troops`, `too_many_marches`, `target_gone` |
| `GET /v1/map` | | `MapSnapshot` (`packages/rules/src/wire.ts`) — places the player's base on first call |
| `GET /v1/map/ws` | WebSocket | pushes `map`, `report` and `base_changed` messages (below) |
| `GET /v1/reports` | | `{ reports, now }` — the latest 20 battle reports, newest first |

Errors are `{ error: <code> }` with a matching status (`src/http.ts`), e.g. `429 rate_limited`.

The client never sends numbers the server reads: an intent names an action and a target, and the server applies `packages/rules` at its own `now`.

## World map (M3)

Each server has one map, owned by one `WorldMap` Durable Object (`src/map/world-map.ts`, SQLite storage, `idFromName(account.server)`; only `algeria-1` exists). It holds base positions, NPC targets and marches in flight. Bases, troops and reports stay in D1.

- **Why one object per map:** marches cross the whole map and two marches on one NPC need a single order of events. A 64×64 map with hundreds of players is far below what one object handles. Splitting by region is the scale path (GDD §12).
- **Logic** lives in `MapService` (plain class over a small SQL interface) and `MapHost` (one operation at a time, push changes, re-arm the alarm). The DO is a thin adapter, and the Node tests run the same two classes on `node:sqlite`.
- **Marches.** The intent handler calls the DO over RPC with its own `now`. The DO checks the target, plans the march with the rules, writes the march row as `pending`, saves the base (troops out, march in `base.marches`, compare-and-set), then marks the row `outbound`. A row stuck in `pending` for 30 s is kept only if the base has it.
- **Arrival.** The DO alarm (or any later call, lazily) fights the battle with the rules and the march's stored seed, then writes the outcome onto the base and the report into `reports` in one D1 batch. Both writes are idempotent, so a retry changes nothing. The troops come home lazily in `advance()` at `returnAt`; if the map ever loses a march, the base brings its troops home unharmed an hour after `returnAt`.
- **NPCs.** 16/10/6 targets of levels 1/2/3 (patrol, convoy, outpost). A defeated target disappears and respawns elsewhere, under a new id, 10 minutes later. Balance numbers are placeholders in `packages/rules/src/data/`.
- **Seeds** stay on the server until the battle is over; the report then includes the seed, so anyone can replay it with `fightNpc`.
- **WebSocket.** Browsers cannot set headers on a WebSocket, so the client offers `Sec-WebSocket-Protocol: revolt.v1, auth.<token>`. The Worker checks the token and the `Origin` (CORS does not cover WebSockets), and the DO answers with `revolt.v1` only. Sockets use the hibernation API, so idle connections cost no duration. Messages: `map` (full snapshot, on connect and on every change; fine at M3 size, diffs later), `report` (to its owner), `base_changed` (fetch `/v1/state` again).
- **Free-tier budget.** DO requests count HTTP, RPC, WebSocket messages and alarms (100,000 a day on the Free plan). Each map change sends one message per connected client, so watch this as players grow.
- **Test clock.** In the e2e build, `POST /__test/clock` also sets the map's clock and fires its alarm, so Playwright exercises alarm → battle → push.

## Accounts and Google

- A first launch calls `POST /v1/guest` and stores the token in `localStorage` (`revolt.session`). It is the only game data on the device.
- A pre-M2 save (`revolt.save`) is sent once with that call and then deleted. This import is the one deliberate exception to "local state has no effect": a forged save can give a new account at most HQ level 3 and resources up to that level's storage cap (`packages/rules/src/import-m1.ts`). After a session exists, the save is ignored.
- `POST /v1/auth/google` verifies a Google ID token (signature against Google's keys, issuer, audience = our web client ID, expiry). If that Google account already owns a base, the device switches to it (second device); if the device is a guest, Google is linked to its base; if the device's account is linked to a different Google account, a new account is created.
- When a sign-in switches the device to another account, the device's old session is deleted. A guest left behind that way, or by `POST /v1/logout`, can never be reached again; the daily cleanup deletes it after a 30-day grace period (below). The client must warn a guest before logging out.

## Abuse limits and housekeeping

- **Guest rate limit.** `POST /v1/guest` allows `GUEST_LIMIT_PER_HOUR` (default 30) new guests per client IP per clock hour; IPv6 counts per /64. The counter lives in D1 (`guest_rate`), keyed by a SHA-256 of the IP bucket, and one atomic upsert either takes a slot or writes nothing, so a flood of refused requests costs reads, not writes. Requests without `CF-Connecting-IP` share one bucket. The Workers Rate Limiting binding was not used: its window is only 10 or 60 seconds, it counts per Cloudflare location, and its docs advise against IP keys. Mobile carriers put many phones behind one IP (CGNAT), so watch for 429s at launch and raise the limit if needed.
- **Session activity.** Authenticated requests move `sessions.last_used_at` to the server's `now` at most once an hour, never backwards.
- **Daily cleanup** (`src/cleanup.ts`, Cron Trigger `0 3 * * *` in `wrangler.jsonc`). Deletes guests with no Google link and no session whose latest activity is 30 or more days old, with their bases and battle reports, at most 500 per run, then removes their bases and marches from the map. Activity is the latest of `accounts.created_at`, `accounts.last_seen_at` (stamped when a session is ended by logout or a switch) and `bases.updated_at`. A guest that still has a session is never deleted, however long it is idle. The same run deletes rate-limit counters from past hours. The query scans `accounts`, which is fine at our size; add an index if the free-tier read count gets close. To run it locally:

```bash
pnpm --filter @revolt/server exec wrangler dev --test-scheduled
```

```bash
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=0+3+*+*+*"
```

Why not Better Auth (1.7): its anonymous plugin links by creating a new user and deleting the guest, so the base would have to be moved in a hook. Verifying Google ID tokens ourselves needs no client secret and no redirect handling, a local signing key makes a trivial mock, and the only dependency is `jose`, where Better Auth brings zod, kysely, several database adapters and telemetry.

## Tests

- `pnpm --filter @revolt/server test` runs the handlers against Miniflare's local D1 with a fake clock and a local signing key standing in for Google. The map runs in-process (`MapService` + `MapHost` on `node:sqlite`); tests fire its alarm by hand.
- `pnpm test:e2e` starts the mock Worker on port 8788 with a fresh local D1 (`.wrangler/e2e`), builds the client against it, and drives both in Playwright. The tests set the server clock through `POST /__test/clock`, which exists only in `src/e2e-entry.ts`.

## On a real phone

Forward the API port as well as the client port:

```bash
adb reverse tcp:8787 tcp:8787
```

With `adb reverse tcp:4173 tcp:4173` from `docs/device-testing.md`, the phone opens `http://localhost:4173`, which is an allowed origin. Over Wi-Fi, the page's origin (`http://<IP>:4173`) must be added to `ALLOWED_ORIGINS`, for example in `apps/server/.dev.vars`, and `wrangler dev` needs `--ip 0.0.0.0`.
