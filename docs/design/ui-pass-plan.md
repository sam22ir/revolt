# UI pass plan

*Started 23 Nov 2026. Goal from the user: the whole UI, one screen at a time. Problems named: too much plain text, looks cheap,
hard to use on a phone, inconsistent.* Look and tokens stay as in `design-system.md` (daylight camp, bronze HUD); this plan is
about structure, components and art in the screens.

## Audit (375×812, en, mock server)

- **Text is too small.** Pages and sheets use 11–12 mockup px; labels 10. Below the 12 px floor for Arabic and hard on a phone.
- **Screens are text lists.** The building sheet is lines of text ("Provisions 80 Arms 80 Funds 60", "Time 1 min"); costs have no
  icons; the training form is a stack of plain rows. Reports and Alliance are bare lists on a dark page.
- **No page structure.** Pages have no title bar or back button of their own, no framed body, no section cards; empty states
  are one grey line ("No battle reports yet.").
- **Buttons don't read as buttons.** A disabled Upgrade looks like the panel; secondary buttons (Join, Max) are flat text.
- **Inconsistent.** The HUD and nav are painted bronze; everything between them is flat gunmetal with hairlines.
- **Art we already own but don't use in Godot:** building portraits, troop art, painted resource icons, hero frames (common,
  rare, legendary), map markers, all in `apps/client/public/art/`.

## The kit (`apps/godot/scripts/ui/`)

Built once, used by every screen. Each is a small Control with its look from `HudTheme`, plus a pure model where it has logic.

| Component | What it is |
|---|---|
| `UiTheme` scale | Font floor: body 14, small 12, title 18, big numbers 20 mockup px. Tap targets at least 44 px. |
| `PageFrame` | Full page: bronze title band (back button at the start edge, title, optional action), framed scrolling body. |
| `Card` | A bronze-framed section with an optional header (icon or portrait + title + trailing value). |
| `CostRow` | Resource icons with amounts; a lacking amount in `LACKING` with the missing quantity. Time with a clock icon. |
| `StatRow` | Icon, label, value, optional "→ next value" for upgrades (+100/h → +150/h). |
| `Buttons` | Primary (gold, one per screen), secondary (bronze), disabled (dimmed with the reason under it), small icon button. |
| `Tabs` | Bronze segmented tabs with a ring on the active one and an optional dot. |
| `ListRow` | Portrait or icon, title, subtitle, trailing value or button; the one row for members, reports, alliances, heroes. |
| `EmptyState` | Icon, one line, and the action that fills it ("No reports yet. Send a march from the map."). |
| `Stepper` | − / value / + / Max for counts, big enough for a thumb. |
| `ProgressBar` | Bronze-trimmed bar with time left on it. |

## Screens, in order

**Backgrounds (24 Nov, user's ask):** every surface of the game moved to the camp kit (plain surfaces, rounded borders, lashed poles round the big panels and game buttons; the user found the first brass version too fancy and the plank and leather textures too busy): HUD bands, cards, pills, buttons, fields, pages, the loading screen and the map's frontier. The screens' layouts are still the old ones until their step below.

**Icons (24 Nov, user's ask):** every SVG icon was redrawn as a detailed full-colour illustration; see `design-system.md` §6.

The kit grows with the screens: each component is built when the first screen needs it, and each migrated screen moves to the
kit's font sizes then (no global font change, which would reflow every screen and the HUD heights the base fit depends on).

1. **Building sheet, first, as the look test.** Card, CostRow, StatRow and the button states, in the real game; its en and ar
   screenshots are the mockup the user approves before the rest. Portrait header (cut from the painting, name, level),
   "now → next" stat rows, cost chips with icons, time, the requirement as a warning line (its lock icon waits for the painted
   set), one gold Upgrade button; the speed-up row at kit sizes. *Built 23 Nov.*
   **Then the bottom sheet was replaced (user's choice, 23 Nov):** a tap on a building outlines it and brings up an **action
   ring** of round bronze buttons over it (Upgrade and Info on every building, Train on the barracks, Heroes on the hero hall;
   own SVG icons). It sits above the building, or below it under the top HUD, kept on screen, reversed in Arabic. Upgrade, Info
   and Train open the building as a **centred card** on a dim backdrop (a tap outside or × closes it and deselects); Heroes
   opens the Heroes page.
2. **Barracks training.** *Built 24 Nov.* Four troop tiles (the Phaser medallions, name, number at home, wounded in red; a gold
   ring on the chosen one), then one card: the troop's role line with its strength and weakness, home and wounded chips, a
   `Stepper` (`scripts/ui/stepper.gd`), cost and time chips, Train. A running batch is its own card on top (medallion, bar,
   countdown, help, speed-up), and the order is hidden until it ends, because the barracks trains one batch at a time.
3. **Top and bottom bars.** *Built 23 Nov.* Top: each resource in a dark pill with a store bar along its bottom edge (brass,
   amber near the cap, gold when full); the player chip as a round avatar with a gold level badge, the guest name and power by
   the painted sword; the builders pill with the painted hammer, a gold rim when idle and a progress line while building. The
   top bar keeps its height (313 px), so the camp's fit is unchanged. Bottom: five even slots, Heroes, Alliance, the big
   Base/Map switch in the middle, Reports and a new Settings button (own gear SVG). The ask-for-help button keeps its place.
4. **Settings.** `PageFrame`, cards for account, language, sound, about.
5. **Reports.** `ListRow` with a win/loss badge and target icon; a report as cards (forces, losses, loot with icons);
   an `EmptyState`.
6. **Alliance.** Search and found as cards; members, chat and help as `ListRow`s under `Tabs`.
7. **Heroes.** Portrait grid with rarity frames; a hero as a card with skills; recruit with odds in a card.
8. **Map sheets.** Tile sheet, march sheet, marches list, rallies: the same kit.
9. **Toasts and badges.** Report toast, unread dots, offline badge.

Each screen: the sheet's rule of rebuilding only when its structure changes is kept (rows update text in place); Arabic is
checked (rows follow the layout direction, the back chevron flips); models covered by GUT tests, en and ar screenshots at 375×812 looked at before the commit, one commit per screen.

## Art

- **Building portraits come from the camp painting itself**, cropped around each building's outline (CampModels), so the
  sheet shows the building the player just tapped. The old `art/buildings/*.webp` are from the earlier base and don't match.
- **Phaser art** (`apps/client/public/art/`: troop art, resource icons, hero frames, markers) is reused only where it matches
  the bronze kit side by side; some of it predates the kit.
- **Needs new art (who makes it is the user's call: Google Flow by the user, or a paid generator within the budget) (generated in Google Flow with the bronze kit as reference, no text):** a page title band, card corners
  if the bronze panel doesn't stretch well, small icons (clock, lock, sword, shield, people), empty-state vignettes. Listed per
  screen as it comes up.

## Not in this pass

New features, new numbers, the base painting and map look, the night-era `art/ui/` pieces (not used).
