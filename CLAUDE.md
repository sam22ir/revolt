# revolt — project rules

Mobile MMO strategy game set in real anti-colonial revolutions (Algeria first, Vietnam second). `revolt` is a code name; the title is undecided, so never hardcode a product name outside the i18n files.

- Design source of truth: `docs/GDD.md`. Read the relevant section before building a feature.
- `docs/original-plan.md` is historical and superseded (it says Supabase; we use Cloudflare).

## Stack

- Client: Phaser + TypeScript + Vite. Versions are whatever is in `package.json`; check with `npm view <pkg> version` before adding a dependency, don't assume from memory.
- Mobile: Capacitor (Android first).
- Backend (from M2): Cloudflare Workers + D1 + Durable Objects + Cron Triggers. Auth is undecided.
- Tests: Vitest for rules, Playwright for screenshots of the running game.
- i18n: i18next with `ar`, `fr`, `en`.
- Package manager: pnpm workspaces.

## Layout

```
packages/rules/   pure game rules shared by client and server (no Phaser, no DOM, no I/O)
apps/client/      Phaser game + DOM UI overlay
apps/server/      Cloudflare Worker + Durable Objects (milestone 2+)
docs/             GDD and design notes
```

## Core rules (do not break)

1. **Rules are pure functions of `(state, now)`.** Production, costs, timers and battles live in `packages/rules`. Compute from timestamps (`stored + rate × (now − last)`, capped); never use ticking counters, `setInterval` accumulation or `Date.now()` inside rules. The caller passes `now`.
2. **Server owns all numbers (M2+).** The client sends intents (`upgrade`, `train`, `march`); the server validates them with `packages/rules` and returns state. The client may predict but never decides.
3. **Battles are deterministic**, using a seeded RNG passed in, so client and server get the same result.
4. **Balance data is data.** Costs, times and stats go in typed tables in `packages/rules/src/data/`, keyed by mechanical id (`farm`, `infantry`). Background-specific names and art are looked up by id, never baked into logic.
5. **No hardcoded user-facing strings.** Every string is an i18n key with entries in `ar`, `fr` and `en`. Missing keys fail the tests.
6. **UI text goes in the DOM overlay, not in Phaser.** Menus, HUD, dialogs and reports are HTML/CSS above the canvas, so Arabic shaping and RTL work. Phaser text is only for short map labels and numbers.
7. **RTL is not optional.** Use CSS logical properties (`margin-inline-start`, not `margin-left`); set `dir` from the active language. Check every new screen in Arabic.
8. **Historical sensitivity.** Follow GDD §6: no playable colonial side, atrocities never as rewards, heroes are "inspired by" real people. When unsure about content, ask; don't invent history.

## Conventions

- TypeScript strict mode. No `any` without a comment saying why.
- Named exports. One concept per file. Files in `kebab-case.ts`.
- Mechanical ids are lowercase snake_case strings, defined as union types in `packages/rules`.
- Keep functions small; prefer plain data and functions over classes in `packages/rules`. Phaser scenes may be classes.

## Testing

- Every rules change comes with Vitest tests, including the timestamp edge cases (cap reached, time going backwards, very long offline gaps).
- UI changes: run the Playwright screenshot check in `en` and `ar` and look at the images before calling it done.
- Run `pnpm test` and `pnpm typecheck` before committing.

## Working in this repo

- Work in small milestones (GDD §11). A milestone is done only when its acceptance criteria pass on a phone.
- Commit small and often, with clear messages. Never push to `main` or deploy without the user's approval.
- Worktrees: symlink `node_modules` from the main checkout instead of reinstalling. Never run several `pnpm install`s in parallel; it stalls this machine.
- No secrets in the repo. Cloudflare credentials stay in the user's environment.
- Budget is under $500/year: prefer free tiers and asset packs; ask before adding any paid service.
