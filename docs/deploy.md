# Deploying to Cloudflare (free tier)

Live URL: **https://revolt-server.nafaa-store.workers.dev** (one Worker serves the web build and the API/WebSockets, so there is no CORS).

## What exists (account samirsaadi610@gmail.com, all new, all `revolt-` prefixed)

- Worker `revolt-server` (`apps/server/src/index.ts`; never the e2e entry, so `/__test/*` returns 404).
- D1 database `revolt-db` (id in `apps/server/wrangler.jsonc`), migrations `0001`–`0005` applied remotely.
- Durable Objects `WorldMap` and `AllianceRoom`, SQLite-backed (migrations v1, v2), Free-plan compatible.
- Cron trigger `0 3 * * *` (daily cleanup).
- Static assets: `apps/client/dist`, uploaded with the Worker via `--assets`.

Google sign-in is off (`GOOGLE_CLIENT_IDS` empty, client built without `VITE_GOOGLE_CLIENT_ID`): the app is guest-only and shows no Google button. To enable it, follow `google-oauth-setup.md`, add the web client ID to `wrangler.jsonc` and build with `VITE_GOOGLE_CLIENT_ID`.

## Redeploy

```bash
pnpm --filter @revolt/server deploy:prod
```

It builds the client with `VITE_API_URL=same-origin`, applies pending D1 migrations to the remote database and deploys. Needs `wrangler login` (OAuth) on this machine. The deployed config lives on branch `main`; `art-direction` does not have it until merged.

## Roll back

```bash
cd apps/server && npx wrangler rollback
```

Rolls the Worker (code and assets) to the previous version. D1 migrations are not rolled back: write a new migration instead.

## Delete everything

```bash
cd apps/server && npx wrangler delete revolt-server && npx wrangler d1 delete revolt-db
```

If `wrangler delete` refuses because of the Durable Objects (not verified), first deploy a migration `{ "tag": "v3", "deleted_classes": ["WorldMap", "AllianceRoom"] }` with the bindings removed; that permanently deletes the game data. After deleting `revolt-db`, local dev is unaffected; rerun `pnpm --filter @revolt/server db:migrate:local` if you recreate it.

## Open it on the phone

Open the live URL in Chrome on the Android phone. No USB or Wi-Fi setup is needed. The first visit creates a guest account (kept in this browser's `localStorage`; clearing site data loses it). Then run the checklist in `device-testing.md`.

## Notes

- Guest creation is limited to 30 per IP per hour (`GUEST_LIMIT_PER_HOUR`). Your phone and this machine may share a public IP; smoke tests use slots.
- A guest that is logged out or abandoned is deleted by the daily cleanup after 30 days; one that keeps a session is never deleted.
- Free-tier limits: 100,000 Worker requests/day, 100,000 Durable Object requests/day, 5 million D1 reads/day.
- `ALLOWED_ORIGINS` includes the workers.dev origin (needed for the WebSocket origin check). A custom domain must be added there.
