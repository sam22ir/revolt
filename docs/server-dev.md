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
| `POST /v1/guest` | `{ background?, importSave? }`: `background` is `"algeria"` (default) or `"vietnam"`, anything else is 400; `importSave` (a pre-M2 local save, imported once, bounded) is honoured for Algeria only | `{ token, account, state, now, imported }` |
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

## Alliances (M4): API contract

Players are named by a **handle** (`account.handle`, 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, unique per server) until players can pick names. It is the name in member lists, chat, help requests and on the map (`bases[].tag`). **No account id is ever sent to another player**: members are addressed by handle, help requests and rallies by opaque ids. Alliance names and chat are player-written text: the client draws them in the DOM overlay only (`textContent`, `dir="auto"`), never in Phaser; the map canvas draws only the ASCII alliance tag.

Rule refusals (a reason the player can fix) answer HTTP 200 with `{ ok: false, reason, now }`; reasons are `ALLIANCE_BLOCK_REASONS` (`packages/rules/src/alliance.ts`) shown as `reason.<code>`. Malformed bodies are 400, a missing or unknown token 401. Types are in `packages/rules/src/wire.ts`.

| Route | Body | Answer |
| --- | --- | --- |
| `GET /v1/alliances?q=` | | `{ alliances: AllianceListItem[], now }` — up to 20 on the player's server, name prefix match (all alliances are open in M4) |
| `GET /v1/alliance` | | `{ alliance: AllianceView \| null, help: HelpRequestView[], now }` — mine, with open help requests of members (`endsAt > now`) |
| `POST /v1/alliance` | `{ name, tag }` | `{ ok: true, alliance, now }`; reasons `already_member`, `bad_name`, `bad_tag`, `name_taken`, `tag_taken` |
| `POST /v1/alliance/join` | `{ id }` | `{ ok: true, alliance, now }`; reasons `already_member`, `alliance_gone`, `alliance_full` |
| `POST /v1/alliance/leave` | | `{ ok: true, alliance: null, now }`; reasons `not_member`, `leader_must_transfer` (a leader may leave only as the last member, which disbands the alliance) |
| `POST /v1/alliance/kick`, `/promote`, `/demote`, `/transfer` | `{ handle }` | `{ ok: true, alliance, now }`; reasons `not_member`, `no_permission`, `target_not_found`, `target_rank` |
| `POST /v1/alliance/hq` | `{ x, y }` | `{ ok: true, alliance, now }` (leader only); reasons `no_permission`, `bad_tile`, `tile_taken`, `hq_cooldown` (once per hour) |
| `POST /v1/help/request` | `{ kind: "upgrade" \| "training" }` | `{ ok: true, request: HelpRequestView, now }`; reasons `not_member`, `no_job`, `already_requested` |
| `POST /v1/help/give` | `{ requestId }` | `{ ok: true, request, now }`; reasons `not_member`, `request_gone`, `own_request`, `already_helped`, `help_full`. Each help ends the requester's job `HELP_REDUCTION_MS` sooner (never before now), at most `MAX_HELPS_PER_REQUEST` times |
| `POST /v1/intent` | `{ type: "rally_start", target, troops, gather }` | as a march: `{ ok, reason?, state, now }`. `gather` is one of `RALLY_GATHER_OPTIONS_MS`. Reasons: the march ones, `not_member`, `no_permission` (officer or leader), `bad_gather`, `target_gone` |
| `POST /v1/intent` | `{ type: "rally_join", rally, troops }` | as above. Reasons: the march ones, `not_member`, `rally_gone`, `rally_closed` (gathering over), `rally_full`, `already_in_rally` |
| `GET /v1/alliance/ws` | WebSocket | chat and change notices (below); 403 if the player is in no alliance |

- **Troops of a rally leave home when a player starts or joins it**, with the rally's timing (`departAt` = end of gathering, `arriveAt`/`returnAt` at the fixed `RALLY_SPEED`), so the march appears in `state.marches` at once with a `rallyId`. The rally fights one battle with everyone's troops against the NPC; each participant gets a report with their own share, and the loss, wounded and loot split is exact (`splitOutcome`). Level-4 targets are `rallyOnly`: a solo `march` intent is refused with `rally_only`.
- **Map snapshot** (`GET /v1/map`, map WebSocket) gains `bases[].alliance` (tag or null), `hqs[]` (alliance HQs, visible to everyone) and `rallies[]` (only the player's own alliance sees them; the seed is never included).
- **Alliance WebSocket.** Same authentication as the map socket (`Sec-WebSocket-Protocol: revolt.v1, auth.<token>`, `Origin` checked). On connect the server sends `history` (up to `CHAT_HISTORY` messages), then pushes `chat`, `members_changed`, `help_changed`, `kicked` and `error`. The client sends `{ type: "chat", text }` (≤ `CHAT_MAX_LENGTH` characters, one line, no control or bidi-format characters; at most `CHAT_RATE_MAX` per `CHAT_RATE_WINDOW_MS`). Chat is stored only in the alliance's Durable Object (last 100 messages).

## Alliances (M4): how it works

- **Membership lives in D1** (`alliances`, `alliance_members`, `help_requests`, `help_given`, migration `0005`). Every change is one guarded statement or batch, so races resolve in SQL: joining at the cap is `INSERT … SELECT … WHERE count < 30`; a kick re-checks both ranks inside the `DELETE`; a leader leaves only as the last member (the guard is in the statement); a transfer changes both ranks or neither.
- **`batch_assert`.** A D1 batch is one transaction, but an `UPDATE` that matches no row does not abort it. A statement that inserts 0 into `batch_assert` (a `CHECK`) fails and rolls the whole batch back: the way to say "all of this or none". Help uses it with a per-helper marker (`help_requests.last_helper`) and `changes()`, so the check passes only if both updates were this batch's own and not merely values another concurrent batch produced. Race tests cover it (`test/help.test.ts`).
- **Chat** is one `AllianceRoom` Durable Object per alliance (`src/alliance/`): last 100 messages in the room's own SQLite, hibernating WebSockets, plain text only. `ChatRoom` (storage, validation, rate limit of 5 per 10 s per member) and `RoomHost` (sockets, notices) are plain classes the Node tests run on `node:sqlite`; the DO is a thin adapter. The Worker authenticates, checks membership in D1 and passes the member's handle and rank in headers; after a membership change it calls `memberChanged` / `notify` / `disband` over RPC (best effort: D1 is the truth, and each chat message re-checks membership there).
- **The map** keeps a copy of each caller's handle and alliance (`map_players`, written only when it changes), so its snapshots show alliance tags and the right rallies. HQs live in the map object (one writer, with the one-hour move cooldown). A rally is a row in `rallies` and one `marches` row per participant, all with the final timing, so joining rewrites nothing later; on arrival `resolveRally` fights one battle and `splitOutcome` shares it exactly.
- **Text safety.** Names, tags and chat reject control, format (bidi overrides, zero-width), separator and unassigned characters, are NFC-normalised, and names are unique by their NFC lower-cased form (`name_key`; SQLite folds only ASCII case, which is fine for Arabic, which has none). Only the ASCII tag is drawn on the map canvas.
- **Cleanup order.** The daily job plans first (which alliances end, who succeeds a deleted leader: oldest officer, else oldest member), cleans the map and rooms (idempotent), and only then deletes D1 rows in one batch. A failure leaves everything for the next run. `help_requests` expire a day after their job ends.
- **Ghost HQs and kicked sockets.** Leave, kick and disband write D1 first and tell the map and room best effort. Two things repair a failed call: the daily job asks each server's map for the alliances that have an HQ and removes those that no longer exist in D1 (`missingAlliances`, `scheduled.ts`; removing is idempotent); and the room asks D1 whether the sender is still a member (`RoomHost.onFrameChecked`, one indexed read) at most once per member per 30 s, before the rate limit, so frame spam cannot spend D1 reads; it cuts the socket if they are gone and drops the message if D1 cannot answer. A kick therefore stops posting at once when the room is told, and within 30 s when that call failed.
- **Free-tier budget.** Each chat message is one incoming WebSocket message (billed 20:1) and an outgoing send per connected member (not billed). Joining, helping and ranks are Worker → D1 only; the room hears of them with one RPC.
- **Deviations from GDD.** All alliances are open (no invitations or applications yet); the rally marches at a fixed `RALLY_SPEED` instead of troop speed (§4.5), so its timing is known when it starts; a rally cannot be cancelled; alliance tech and gifts (§4.7) are not built.
- **Durable Object SQLite limits.** A Durable Object's SQLite allows far fewer terms in a compound `SELECT` than Node's does; `MapService.nextDueAt` runs separate small queries for that reason (found only by running the real runtime).

## Heroes and story (M5)

No D1 migration: heroes and story progress live inside `BaseState` (the JSON in `bases.state`). Old rows are filled in by `migrateBaseState` (hero hall level 1, every hero level 0 with no shards, story at chapter 0). A client save imported at guest creation never carries heroes or story.

New intents on `POST /v1/intent` (all computed by `packages/rules` at server time; client-sent levels, costs or rewards are never read):

- `{ type: "hero_recruit", hero }` and `{ type: "hero_level", hero }`. Refusals come back as `ok: false` with a reason: `unknown_hero`, `already_recruited`, `not_recruited`, `not_enough_shards`, `hall_level`, `max_level`, `insufficient`.
- `{ type: "story_claim" }`. Reasons: `objectives_unmet`, `story_complete`.
- `march`, `rally_start` and `rally_join` take an optional `heroes: HeroId[]` (lead first, at most 3, known ids; anything else is a 400). Extra refusals: `bad_squad` (duplicates), `hero_not_owned`, `hero_busy`.

How a squad works: a hero is busy exactly while it appears in `state.marches[*].heroes`, so it comes home with the march. The squad is frozen when the march leaves (`[{id, level}]`, levels read from the base being saved) and stored in the map's `marches.heroes` column (added with a PRAGMA-guarded `ALTER`, like `rally_id`; old rows read as no heroes). The battle on arrival uses that snapshot, so a level-up while the hero is out changes nothing. A rally adds up every participant's hero bonus and caps the total. The report lists the heroes (`BattleReport.heroes`).

Shards: story chapter rewards, and a drop for the lead hero when a victorious march with heroes returns (`NPC_SHARD_DROP`, applied once in `advance`). Victories with a hero also count for the story.

Deviations and notes:

- GDD §4.4 recruitment draws with published odds and a pity counter are NOT built. Recruitment is deterministic (shards plus support). Draws need server RNG, published odds and a monetisation review, so they are deferred (GDD §12).
- Chapter 1 asks for command post level 2 (60 s), not farm level 2: a producer cannot pass level 1 before the command post does.
- All balance numbers are placeholders.
- Story text is draft and flagged for historian review: see `docs/story-review.md`.

## Backgrounds and servers (M6)

- The background is chosen once, when the account is created (`POST /v1/guest`), and never changes. It fixes the map server: `algeria-1` or `vietnam-1` (`BACKGROUND_SERVER` in `packages/rules/src/background.ts`). `account.background` in every answer is derived from `accounts.server` (`backgroundOfServer`, which also accepts a later `<background>-<n>`), so no column or migration is needed. It is shown to the account's owner only.
- Separation needs no extra code: the map Durable Object is `idFromName(account.server)` (`vietnam-1` is created on first use, with no new binding), and alliances, handles and chat are scoped by `server`. A join by an alliance id from the other server answers `alliance_gone`.
- `POST /v1/auth/google` takes no `background`. A guest that links Google keeps its server; a device that signs in to an existing Google account switches to that account and its server whatever it had; a device whose account is linked to another Google account gets a new account on its current server. The client reloads when a switch changes background.
- Heroes: `HERO_IDS` lists both rosters (12 ids) so a base keeps progress for every id; `heroesFor(background)` is the roster. `recruitHero`/`checkRecruit` take the background and refuse a hero of the other roster as `unknown_hero`; everything else (level-up, squads, marches, shard drops) needs a recruited hero, so that one check keeps the rosters apart. Old stored bases (6 heroes) are filled in by `migrateBaseState`.
- Story: `claimChapter(state, now, background)` uses that background's chapters (`STORY[background]`).
- Deploying M6 applies nothing new: no migration, no binding.

## Live features (M7): events, rankings, pass, store

Routes (all bearer-auth, all scoped to the account's server; players are named by handle, never by id):

| Route | What |
|---|---|
| `GET /v1/events` | Open events and recently ended ones with something earned: score, rank, tier, claim state. |
| `POST /v1/events/claim {event}` | After a window ends (7 days grace) pays the highest tier reached, once. |
| `GET /v1/leaderboard?board=power\|regions\|alliance\|event[&event=key]` | Top 50 and the viewer's own place. |
| `GET /v1/pass`, `POST /v1/pass/claim {tier, track}` | The season's pass; each tier pays once per track; premium needs the purchase. |
| `GET /v1/store`, `POST /v1/store/redeem {sku, provider, receipt}`, `POST /v1/cosmetics/equip {slot, cosmetic}` | Catalog and wallet; receipt redemption; wearing cosmetics. |
| `POST /v1/intent {type:"speedup", job, tokens}` | Spends speed-up tokens on the running upgrade or training. |

How it holds together:
- Event windows and pass seasons are computed from the clock and the tables in `packages/rules/src/data` (`events.ts`, `battle-pass.ts`, `store.ts`, `cosmetics.ts`). The cron never has to roll anything over; it only prunes old rows (`db/live-prune.ts`).
- Scores and pass XP are **sums of `live_awards` rows**, one per (march, key), written with `INSERT OR IGNORE` in the same batch as the battle report (`map-service.deliverOutcome`). A retry or a lost compare-and-set cannot count twice.
- Every one-time grant (event reward, pass tier, purchase) goes through `db/grants.ts` and a `claims` row used as a lock (`granted` 0, 2, 1, `changes()` chaining inside one D1 batch). Verified on real D1 in `miniflare-smoke.test.ts`.
- Power and regions boards read `score_snapshots`, refreshed when a player's state is read or saved. Other players' rows can lag until they next open the game. "Regions liberated" = `story.victories` (GDD names the board but not the measure: placeholder definition).
- Speed-ups: tokens and the day's use live in `wallet` (not in the base). Rules (`store.ts`): 15 min per token, 4 h per UTC day, never on the command post's own upgrade, clock rewinds keep the day's usage.
- Fair F2P (GDD §8) is enforced by rules tests: no product sells shards or heroes, the premium pass track has no shards, resources stop at the HQ storage cap.
- Billing, analytics and crash reporting are `Deps` (`billing/`, `telemetry.ts`). `production-deps.ts` (the deployed Worker) has no test verifier and cannot verify receipts yet. **`LocalBilling` accepts `local-test:<txn>` for free and must never be deployed**: it exists only in `e2e-entry.ts` and the test harness (a test greps the deployed modules for it). Secret `REVENUECAT_SECRET` is set with `wrangler secret put`, never in the repo.
- Test hook (e2e entry only): `POST /__test/award {accountId, key, points}`.
- Design deviations from the plan: no `BaseState` change (tokens and cosmetics are account-level D1 rows); event claims are recorded in `claims`, not a separate `event_claims` table; the e2e spec is `zz-live.spec.ts` so it runs after the specs that share the map clock; the base scene does not yet draw the equipped base skin (art TODO, equipped state is already served).

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
> Historical (the Playwright e2e was removed): - `pnpm test:e2e` starts the mock Worker on port 8788 with a fresh local D1 (`.wrangler/e2e`), builds the client against it, and drives both in Playwright. The tests set the server clock through `POST /__test/clock`, which exists only in `src/e2e-entry.ts`.

## Browser quirk: panels and the canvas

In headless Chromium (software GL), a `box-shadow` on an element that scrolls (`overflow-y: auto`) and sits above the WebGL canvas made the canvas area above it paint solid black or white in screenshots; `overflow: visible` hid it, which is why it looked like an overflow problem. The panels now use `filter: drop-shadow` (same look). A `filter` makes its element the containing block of `position: fixed` children, so `.alliance-panel` (which holds its confirm dialog) has no shadow instead. `e2e/zoom.spec.ts` fails if the bug returns. Not confirmed on a real phone: that check is still open for M3 and M4.

## On a real phone

Forward the API port as well as the client port:

```bash
adb reverse tcp:8787 tcp:8787
```

With `adb reverse tcp:4173 tcp:4173` from `docs/device-testing.md`, the phone opens `http://localhost:4173`, which is an allowed origin. Over Wi-Fi, the page's origin (`http://<IP>:4173`) must be added to `ALLOWED_ORIGINS`, for example in `apps/server/.dev.vars`, and `wrangler dev` needs `--ip 0.0.0.0`.
