# Godot migration plan

## Status

- **Slice 0 done** (branch `godot-client`): Godot 4.7.2 + export templates installed (checksums verified), `apps/godot/` project, GUT tests (`pnpm godot:test`, 23 tests, works from a clean checkout), shared data export (`pnpm godot:export`), Web export (`pnpm godot:web`) served by the `godot-web` launch entry on port 8060 and checked in the built-in browser at phone size in `en` and `ar` (shaping and RTL mirroring correct).
- Font: **IBM Plex Sans Arabic** (Regular + Bold, SIL OFL, from google/fonts, in `apps/godot/fonts/`), set as the project default font; it covers Arabic and Latin. Plain IBM Plex Sans has no Arabic glyphs.
- Next: slice 1 (world map), then the open questions below that are still open (Android sign-in, CLAUDE.md/GDD wording, CI step).
- `main` fails one server test (`live-leaderboard`, order-dependent); tracked as a separate task, not part of this branch.

## Slice 1 plan: world map (in progress)

Facts: `MAP_SIZE` is 64 (4096 tiles). `GET /v1/map` returns `terrainSeed`, `size`, bases, NPCs, HQs, marches, rallies, liberations, `now`. Terrain and regions are pure functions of the seed (`terrainAt`, `regionAt`), computed on the client, never sent. The mock server (`server-mock`, port 8787) allows CORS only from ports 5173, 4173 and 4174, so the Godot preview moves to **4173** (no server change). Native Android sends no Origin header.

1. **Port the map math** to GDScript: `hash32` (32-bit wrap), `valueNoise`, `terrainAt`, `regionAt`, `regionSite`. Golden fixtures from the real rules (several seeds including 0 and 4294967295, full 64x64 terrain and region grids), Vitest stale check, GUT parity test.
2. **Network:** `Api` (HTTPRequest): guest login, token kept in `user://`, `GET /v1/map`; base URL from a `?api=` query parameter on web, default `http://localhost:8787`.
3. **Map view:** isometric `TileMapLayer` with a runtime-generated TileSet (flat colours per terrain; the real terrain art comes in a later slice), region borders, markers for bases, NPCs, HQs and marches, short ASCII tag labels only (rule 6).
4. **Camera:** drag pan, pinch and wheel zoom, clamped to the map, starts on the player's base.
5. **Perf probe:** FPS label so the phone run can be compared with the Phaser build.
6. **Verify:** mock server + `godot-web` on 4173, screenshots at phone size in `en` and `ar`, compared with the Phaser map.

Out of scope for slice 1: live WebSocket updates, tapping tiles, march drawing animation, final art.

# Original plan (draft)

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

## Server contract for a thin client (checked against `main` 7884d09)

**No server change is needed.** Every snapshot (`GET /v1/state`, intent replies, guest and Google login) already carries what the client needs:

- `state.resources` (stored), `state.levels`, `state.lastUpdated` (epoch ms the amounts are settled to),
- timers as epoch ms: `queue`/`training`/`marches[]` with `startedAt`, `endsAt`, `departAt`, `arriveAt`, `returnAt`,
- `liberations` (server-wide regions held, `from`/`until`), which scale production,
- the server's `now`.

Rates and caps are not sent. They derive from `levels` (and the liberation multiplier), so the client computes them from the exported balance tables. Instead of a server change, drift is caught by golden fixtures: `scripts/export-godot.mjs` runs the real `accrue` over edge cases (cap reached, above-cap kept, time going backwards, ten years offline, liberation starting/ending mid-span, bonus capped) and a GDScript test must reproduce the results from `balance.json` alone. Vitest fails when the committed JSON is stale. **The GDScript half of this check runs locally only (`pnpm godot:test`) until the CI step below is approved**: if someone changes `accrue` and regenerates the fixtures, only the Godot run shows the mismatch.

Client display formula: `ResourceDisplay.amounts` (GDScript) mirrors `accrue`: segments split at liberation changes, `min(cap, stored + rate * multiplier * dt)`, amounts at or above the cap kept as is, `now` from `Clock`: the server's `now` from the last response plus monotonic ticks since (`Time.get_ticks_msec`), so changing the phone's date or time cannot move counters or timers.

### Draft CI step (not applied; needs your OK)

Same job and check name ("Typecheck and unit tests"), added to `.github/workflows/ci.yml` after `pnpm test`:

```yaml
      - name: Install Godot (pinned, checksum verified)
        run: |
          V=4.7.2-stable
          B=https://github.com/godotengine/godot/releases/download/$V
          curl -fsSL -O "$B/Godot_v${V}_linux.x86_64.zip" -O "$B/SHA512-SUMS.txt"
          grep "Godot_v${V}_linux.x86_64.zip" SHA512-SUMS.txt | sha512sum -c -
          unzip -q "Godot_v${V}_linux.x86_64.zip"
          sudo install "Godot_v${V}_linux.x86_64" /usr/local/bin/godot
      - run: pnpm godot:test
```

About 80 MB download and ~10 s of tests per run; `pnpm godot:test` imports first, so it works from a clean checkout.

## Shared data

- `pnpm godot:export` (`scripts/export-godot.mjs`) writes `apps/godot/data/balance.json`, `display-fixtures.json` and `apps/godot/locale/{en,ar,fr}.po`. Builders: `packages/rules/src/export/godot-data.ts` and `apps/client/src/i18n/export-po.ts` (the latter moves when the locales leave `apps/client`).
- Vitest (`godot-export.test.ts`, `godot-locale.test.ts`) fails when a committed file is stale, so the existing CI check covers it. Run Godot tests with `pnpm godot:test` (headless GUT).
- i18n: done for slice 0. `msgid` is the dotted key, `{{x}}` becomes `{x}`, `background.<id>.<key>` overrides work through `Loc.t(key, vars, background)`. GUT tests check identical key sets in all three languages, no empty strings, and that every `Loc.t("key")` in scripts exists (rule 5).

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
