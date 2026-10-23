# Godot migration plan (draft, awaiting approval)

Decision (user): replace the Phaser + DOM + Capacitor client with a Godot client. Language: **GDScript**. Rules: **server-driven thin client** (no GDScript port of `packages/rules`).

## What stays, what goes

| Part | Fate |
| --- | --- |
| `packages/rules` (2k lines TS) | Stays. Server keeps using it. Source of truth for all numbers. |
| `apps/server` (3k lines TS, Workers + D1 + DOs) | Stays. Small additions only (see Server contract). |
| `apps/client` (9k lines TS, Phaser + DOM) | Stays untouched until the Godot client reaches parity on a real phone. Deleted only with the user's yes. |
| `art/`, `docs/GDD.md` | Stay. Art is re-imported into Godot. |
| New `apps/godot/` | The Godot 4 project. |

Branch from `main` (not `base-camera-fit`).

## Open questions for the user (block parts of the plan)

1. **Downloads** (each needs a yes; name, source, size confirmed at the time):
   - Godot 4 editor, Linux x86_64. Version: take it from godotengine.org/download, not memory (a web search found 4.7.2 only on third-party mirrors, unverified).
   - Godot Android export templates (same version, ~1 GB unpacked).
   - A GDScript test framework: GUT or gdUnit4 (small, from GitHub/Asset Library).
   - Android SDK pieces Godot needs (build-tools, platform, NDK not required for GDScript-only). `java`, `adb` and `sdkmanager` are already on this machine; check versions first.
2. **Google sign-in on Android.** Godot has no Credential Manager bridge. Options: (a) a Godot Android plugin wrapping Credential Manager, (b) browser OAuth + deep link. Same server endpoint (`POST /v1/auth/google`) either way. This is the biggest technical risk; spike it early. Guest accounts work without it.
3. **Verification loop.** CLAUDE.md requires map screenshots in the built-in browser. Proposal: **Godot Web export** served locally and opened with `preview_start` (keeps the current workflow, en/ar checks included). Android phone is still the acceptance device. Fallback: headless xvfb PNG capture. Needs a `launch.json` entry and the one-dev-server rule applied to Godot.
4. **CLAUDE.md / GDD wording.** Rules 5-7 (strings, DOM overlay, CSS logical properties), the Stack and Testing sections, GDD §10 and the CI workflow all assume Phaser/DOM/Vite/Capacitor. I will draft replacements as a diff for approval; I will not edit your rules unprompted. The required CI check name "Typecheck and unit tests" stays unchanged.
5. **Product name.** Keep it out of `project.godot` and the Android export; use the code name, with the app label from translations.

## Server contract for a thin client

The client cannot import rules, so every state payload must let it display counters without deciding anything:

- per resource: `stored`, `rate`, `cap`, `last` (timestamp),
- per timer (upgrade, training, march): `start`, `end`,
- the server's `now` on each response, so the client computes a clock offset and never trusts the device clock.

Client display formula (GDScript, tested): `min(cap, stored + rate * max(0, now - last))`, including cap reached, time going backwards, and multi-day offline gaps (rule 1 edge cases). The server still validates every intent.

First task: read `apps/server/src/handlers` and `apps/client/src/net/api.ts` to see which of these fields already exist; add only what is missing, with server tests.

## Shared data

- Script `scripts/export-balance.mjs`: writes `packages/rules/src/data` (costs, times, stats, ids) to JSON under `apps/godot/data/`.
- A test (and CI step) fails when the JSON is stale vs the TS tables.
- i18n: convert `apps/client/src/i18n/locales` (ar, fr, en) to gettext `.po` (CSV has no plurals; Arabic has six forms). Convert `{{x}}` placeholders. Add a check that every key exists in all three languages (rule 5).

## Arabic / RTL

- Set `layout_direction` and locale from the active language; HUD built from Control nodes (containers mirror in RTL).
- Bundle an Arabic-capable font with fallback.
- Keep Godot's advanced text server in the Android export; verify shaping on the phone and in the web export, not only in the editor.

## Slices (each ends with en + ar screenshots, then a phone check)

0. Toolchain: install editor + templates (after approval), create `apps/godot/`, headless import, test runner works, web export served via `preview_start`.
1. **World map** from the mock server JSON: isometric TileMapLayer, pan/zoom, one Arabic label. (Where Phaser struggled, so it decides whether the migration was worth it. Compare frame rate on the phone with the Phaser build.)
2. Session + network: guest auth, state fetch, clock offset, HTTP/WebSocket clients (map + alliance sockets).
3. Base screen and building panels, upgrade timers.
4. HUD, resources, queue, battle reports, alliance chat.
5. Google link on Android (spike result from open question 2).
6. Android export, signing, phone acceptance against GDD §11 M1-M3 criteria.
7. Remove the Phaser client, update CI, CLAUDE.md, GDD §10 (with approval).

## Machine constraints

- 2 cores: the first Godot import (`.godot/`) is slow. Worktrees each re-import, so do not run parallel worktree sessions that open the project. Symlinking `.godot/` between worktrees is not safe; use one worktree for Godot work.
- Run at most one Godot process, plus the mock server. Never alongside the Phaser dev server. Never two test suites at once.

## Risks

- Google sign-in (above).
- RevenueCat and Firebase (M7) need Godot Android plugins; check availability before M7.
- Loss of the TS-only client tests: ~28 client test files cover logic that moves to GDScript or to the server. List which behaviors to re-cover before deleting them.
- My ability to verify UI depends on the web export working; slice 0 proves this before anything else is built.
