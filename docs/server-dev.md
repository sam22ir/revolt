# Game server: local development (M2)

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

The client never sends numbers the server reads: an intent names an action and a target, and the server applies `packages/rules` at its own `now`.

## Accounts and Google

- A first launch calls `POST /v1/guest` and stores the token in `localStorage` (`revolt.session`). It is the only game data on the device.
- A pre-M2 save (`revolt.save`) is sent once with that call and then deleted. This import is the one deliberate exception to "local state has no effect": a forged save can give a new account at most HQ level 3 and resources up to that level's storage cap (`packages/rules/src/import-m1.ts`). After a session exists, the save is ignored.
- `POST /v1/auth/google` verifies a Google ID token (signature against Google's keys, issuer, audience = our web client ID, expiry). If that Google account already owns a base, the device switches to it (second device); if the device is a guest, Google is linked to its base; if the device's account is linked to a different Google account, a new account is created.
- A guest base left behind when a device switches stays in D1 unused. Cleanup is a later job.

Why not Better Auth (1.7): its anonymous plugin links by creating a new user and deleting the guest, so the base would have to be moved in a hook. Verifying Google ID tokens ourselves needs no client secret and no redirect handling, a local signing key makes a trivial mock, and the only dependency is `jose`, where Better Auth brings zod, kysely, several database adapters and telemetry.

## Tests

- `pnpm --filter @revolt/server test` runs the handlers against Miniflare's local D1 with a fake clock and a local signing key standing in for Google.
- `pnpm test:e2e` starts the mock Worker on port 8788 with a fresh local D1 (`.wrangler/e2e`), builds the client against it, and drives both in Playwright. The tests set the server clock through `POST /__test/clock`, which exists only in `src/e2e-entry.ts`.

## On a real phone

Forward the API port as well as the client port:

```bash
adb reverse tcp:8787 tcp:8787
```

With `adb reverse tcp:4173 tcp:4173` from `docs/device-testing.md`, the phone opens `http://localhost:4173`, which is an allowed origin. Over Wi-Fi, the page's origin (`http://<IP>:4173`) must be added to `ALLOWED_ORIGINS`, for example in `apps/server/.dev.vars`, and `wrangler dev` needs `--ip 0.0.0.0`.
