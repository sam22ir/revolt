# revolt — project rules

Mobile MMO strategy game set in real anti-colonial revolutions (Algeria first, Vietnam second). `revolt` is a code name; the title is undecided, so never hardcode a product name outside the locale files.

- Design source of truth: `docs/GDD.md`. Read the relevant section before building a feature.
- Client work: read `docs/godot-migration.md` first. It holds the status of each slice and what is still pending.
- `docs/original-plan.md` is historical and superseded (it says Supabase; we use Cloudflare).

## Stack

- Client: **Godot 4.7, GDScript** (`apps/godot`). Mobile renderer, `gl_compatibility`. Versions of npm packages are whatever is in `package.json`; check with `npm view <pkg> version` before adding one, don't assume from memory.
- Mobile: Godot's Android export (`pnpm godot:android`, debug APK). Android first.
- Backend (from M2): Cloudflare Workers + D1 + Durable Objects + Cron Triggers. Auth: guest account per device, then link Google; self-hosted on Workers + D1 (see GDD §10).
- Tests: Vitest for `packages/rules` and `apps/server`; GUT for `apps/godot` (`pnpm godot:test`). No browser e2e.
- i18n: `ar`, `fr`, `en`. Source strings live in `apps/client/src/i18n/locales/*.ts` for now; `pnpm godot:export` writes them to `apps/godot/locale/*.po`. Godot reads them with `Loc.t(key, vars, background)`.
- Package manager: pnpm workspaces.

## Layout

```
packages/rules/   pure game rules shared by client and server (no engine, no DOM, no I/O)
apps/godot/       the game client (Godot 4, GDScript, GUT tests in test/unit/)
apps/server/      Cloudflare Worker + Durable Objects
apps/client/      LEGACY Phaser client. No new features. Still the source of the locales, the art
                  manifests and some Godot fixtures (see "Generated data"), until those move out.
docs/             GDD and design notes
```

## Core rules (do not break)

1. **Rules are pure functions of `(state, now)`.** Production, costs, timers and battles live in `packages/rules`. Compute from timestamps (`stored + rate × (now − last)`, capped); never use ticking counters, `setInterval`/`_process` accumulation or `Date.now()` inside rules. The caller passes `now`.
2. **Server owns all numbers.** The client sends intents (`upgrade`, `train`, `march`); the server validates them with `packages/rules` and returns state. The client may predict but never decides. Godot gets balance numbers only from the generated `data/balance.json`, never hand-typed.
3. **Battles are deterministic**, using a seeded RNG passed in, so client and server get the same result.
4. **Balance data is data.** Costs, times and stats go in typed tables in `packages/rules/src/data/`, keyed by mechanical id (`farm`, `infantry`). Background-specific names and art are looked up by id, never baked into logic.
5. **No hardcoded user-facing strings.** Every string is a locale key with entries in `ar`, `fr` and `en`, shown through `Loc.t`. Missing keys fail the tests (Vitest on the sources, GUT on the `.po` files and on every `Loc.t("key")` in scripts).
6. **UI is built from Godot Control nodes** (containers, labels, buttons), not drawn by hand, so Arabic shaping and mirroring work. Keep the advanced text server in exports.
7. **RTL is not optional.** Set `layout_direction` and the locale from the active language; use containers that mirror instead of fixed left/right positions. The HUD mirrors in Arabic; the world map does not. Use the bundled IBM Plex Sans Arabic font. Check every new screen in Arabic.
8. **Historical sensitivity.** Follow GDD §6: no playable colonial side, atrocities never as rewards, heroes are "inspired by" real people. When unsure about content, ask; don't invent history.

## Generated data

- `pnpm godot:export` (`scripts/export-godot.mjs`) writes `apps/godot/data/*.json` (balance and golden fixtures), `apps/godot/locale/*.po` and the terrain art. Never edit those files by hand; change the source and re-export.
- Run it after any change to `packages/rules` data, the locales or the art manifests. Vitest freshness tests fail when the committed files are stale.
- `apps/godot/data/captured-*.json` are real mock-server replies saved by hand, not generated.

## Conventions

- TypeScript strict mode. No `any` without a comment saying why. Named exports. Files in `kebab-case.ts`.
- GDScript: static types on variables, arguments and returns. Files in `snake_case.gd`. Keep logic in small pure model scripts (`*_model.gd`, `*_math.gd`) that GUT can test without a scene; nodes only display and forward input.
- One concept per file.
- Mechanical ids are lowercase snake_case strings, defined as union types in `packages/rules`.
- Prefer plain data and functions over classes in `packages/rules`.

## Testing

- **Test only `en` and `ar`.** French stays supported in the app (keep `fr` strings complete), but don't add `fr` to UI tests or CI.
- Every rules change comes with Vitest tests, including the timestamp edge cases (cap reached, time going backwards, very long offline gaps).
- Godot logic ported from TypeScript is checked against golden fixtures from `pnpm godot:export`, so both sides agree tile for tile.
- Run `pnpm test` (~22 s), `pnpm typecheck` and `pnpm godot:test` before committing. CI runs only the first two ("Typecheck and unit tests", required on `main`); GUT does not run in CI yet.
- UI changes: `pnpm godot:web`, then open it with `preview_start` (`godot-web`, port 4173, plus `server-mock` on 8787) at phone size in `en` and `ar`, and look at the affected screens before calling it done. **Always take screenshots of the world map with the built-in browser** (`mcp__Claude_Browser__*`, not Claude in Chrome) whenever a change could affect the map.
- The acceptance device is a real Android phone (`pnpm godot:android`, then `adb install -r` and `adb reverse tcp:8787 tcp:8787`; details in `docs/godot-migration.md`).
- Server tests run on in-process `node:sqlite` (`apps/server/test/sqlite-db.ts`); only `miniflare-smoke.test.ts` uses Miniflare's D1. Keep it that way: Miniflare costs ~1 s per start and ~40 ms per query.

## Machine constraints

- This machine is slow (2 cores, runs hot): never run two test suites at once.
- Run at most one Godot process plus the mock server, across all sessions. Before starting a server, check whether one is already running (`ss -ltnp`) and reuse it. Stop it when you're done.
- The first Godot import (`.godot/`) is slow and each worktree re-imports. Use one worktree for Godot work; don't symlink `.godot/` between worktrees.
- Worktrees: symlink `node_modules` from the main checkout instead of reinstalling. Never run several `pnpm install`s in parallel; it stalls this machine.

## Working in this repo

- Work in small milestones (GDD §11). A milestone is done only when its acceptance criteria pass on a phone.
- Commit small and often, with clear messages. Never push to `main` or deploy without the user's approval.
- No secrets in the repo. Cloudflare credentials and release keystores stay in the user's environment.
- Budget is under $500/year: prefer free tiers and asset packs; ask before adding any paid service.
