> **Rejected 3 Nov 2026.** The user chose the daylight camp and a bronze HUD instead: see `design-system.md`. Kept for history.

# Design system: night and lamp

*Decided 28 Oct 2026. Replaces the "dark metal with bronze" UI and the warm-daylight style in GDD §7. Supersedes `docs/art-direction-v2.md` where they disagree.*

**The one reference is [`concepts/c-night-ui.jpg`](concepts/c-night-ui.jpg).** When this doc and the image disagree on looks, the image wins; when they disagree on rules (contrast, RTL, no faces), this doc wins. The other files in `concepts/` are rejected explorations, not references. `c-night-story.jpg` shows readable faces and must not be used as a style reference.

## 1. The idea

The movement works at night. The player sees their camp the way an organizer would: from the dark, by lamplight. The interface is field equipment: olive metal cases with bolts, worn canvas, brass, a pinned ink sketch, a red ribbon marking what matters. Lamps are the only warm light, so **amber means "act here"**.

Story framing (the notebook, the lamp, the radio) is the setting for story scenes. The story content itself is still open: the player frame, the tone, and every fact need the user's decisions and historian review (GDD §6). This doc does not invent history.

## 2. Decisions

| Topic | Decision (28 Oct) |
|---|---|
| Reference | `c-night-ui.jpg` exactly, including the open-hand support icon |
| Bottom nav | Five equal square buttons, as in the image. Replaces the round Base/Map corner button decided on 25 Oct (`godot-visuals-plan.md`) |
| Frames | Painted nine-slice textures generated in Flow, not code-drawn boxes |
| Scope | Night everywhere: HUD, base camp and world map |

## 3. Color tokens

Tokens have role names so Vietnam can supply its own values later (GDD §7: same footprints, own palette). The values below are Algeria's, measured from the reference image. Text and accent colors were chosen for contrast, because the image has no real text.

### Interface

| Token | Hex | Use |
|---|---|---|
| `panel` | `#2A2E25` | Panel and card fill (charcoal green) |
| `panel_deep` | `#252820` | Inset slots: resource cells, list rows, inputs |
| `panel_edge` | `#1A1B13` | Inner shadow line, dividers |
| `frame` | `#4D4C34` | Olive metal frame |
| `frame_light` | `#5E5A3B` | Frame highlight edge, button faces |
| `frame_dark` | `#2F3022` | Nav bar body, frame shadow edge |
| `brass` | `#AB9355` | Bolts, hinges, decorative metal only |
| `brass_icon` | `#D8C48A` | Nav and line icons on button faces and frames |
| `text` | `#E6DFC8` | Body text, numbers |
| `text_second` | `#B9B092` | Labels, rates, secondary text |
| `lamp` | `#C07A24` | Primary button fill, active nav glow |
| `lamp_light` | `#D9A24E` | Primary button highlight, pressed glow |
| `lamp_dark` | `#824611` | Primary button bottom edge |
| `lamp_text` | `#E0A94A` | Amber text and bars on dark panels (timers, progress) |
| `ink` | `#1E1C10` | Text on amber buttons and on paper |
| `paper` | `#CDBC9F` | Pinned sketch cards, story pages |
| `ribbon` | `#8E1B17` | Ribbons and stamps. **Decoration only**, never text or a sole signal |
| `alert` | `#EC7560` | Errors, attacks, "not enough" |
| `ready` | `#9DB06A` | Done, ready to collect, success |

### Contrast (WCAG)

| Pair | Ratio | Verdict |
|---|---|---|
| `text` on `panel` | 10.4 | Body text, all sizes |
| `text_second` on `panel` | 6.4 | Labels |
| `lamp_text` on `panel` | 6.6 | Timers, bars |
| `ready` on `panel` | 5.8 | Status |
| `alert` on `panel` | 4.8 | Status text |
| `ink` on `lamp` | 4.9 | Primary button labels |
| `ink` on `paper` | 8.1 | Sketch and story pages |
| `text` on `frame` | 6.6 | Only `text` may sit directly on the frame |
| `brass_icon` on `frame_light` | 4.1 | Nav icons (3:1 needed) |
| `brass` on `frame_light` | 2.3 | Fails: never for icons |
| `alert` on `frame_light` | 2.4 | Fails alone: alert dots get a 1.5 px `ink` ring (5:1 against the dot) |
| `ribbon` on `panel` | 1.5 | Never for text or meaning |

Rules: body text uses `text` or `text_second` only. Never light text on amber (2.6). Arabic at 11 to 13 px uses `text`, not `text_second`.

### Scene (night)

| Token | Hex | Use |
|---|---|---|
| `sky` | `#193858` | Sky, far mountains |
| `night_deep` | `#131A20` | Deepest shadows |
| `rock` | `#333A41` | Lit rock and ground |
| `rock_light` | `#464E59` | Moonlit tops of ground and paths |
| `foliage` | `#172326` | Olive trees and scrub |
| `lamplight` | `#7E513C` to `#E0A94A` | Light pools at doors and windows |

## 4. Type

- **Font:** IBM Plex Sans Arabic for Arabic and Latin (already decided). Two weights: regular and bold (the files in `apps/godot/fonts`).
- **Sizes (at the 375 pt design width, scaled by `HudTheme.SCALE`):** 11 small labels, 13 body, 15 titles and numbers, 18 page titles.
- **Handwriting:** the scribbles in the image stand for text. Real text is set in Plex, never a handwriting font, so Arabic stays readable. A handwritten feel can be used only for decorative, non-text marks.

## 5. Components

### Frames (painted nine-slice)

- **Anatomy:** an olive metal outer frame with a square outside corner, a bolt in each corner, and a darker inner lip around a flat `panel` fill. A hinge or clip on the top edge for cards.
- **Art rules:** generate in Flow on a plain flat background for cutout. Front-on, no perspective, even lighting (no lamp glow baked in), wear only at the edges. Only the corners carry detail. Edges must tile or stretch without visible repeats.
- **Slices:** corners are fixed size; edges stretch; the centre is not textured (Godot `StyleBoxTexture` with the centre drawn as `panel`, so text sits on a flat color).
- **Mirroring:** frames must look right flipped horizontally for Arabic. Avoid one-sided details such as a hinge on only one side.
- **Sizes:** export at 3× (1080 px wide) and check at 360 dpi so the bolts stay sharp. One master per frame kind: `frame_hud` (top bar), `frame_card` (building card), `frame_nav` (nav bar), `frame_button` (square nav button), `frame_page` (full pages).
- **Fallback:** keep `StyleBoxFlat` versions of the same tokens for screens not yet reskinned and for tests.

### Top bar

Four resource cells in one bolted bar: icon, amount in `text`, a short `lamp_text` bar underneath for fill level against the cap. Icons: grain sack, supply crate, coin stack, open hand (support). Shown on the base and the map only.

### Building card

A bolted card with a hinge clip on top. Start side: the pinned ink sketch of the building on `paper`, with a `ribbon` tab and a red stamp ring as decoration. End side: name, level, cost lines and the amber primary button. A `ribbon` corner tab marks a card with something new.

### Buttons

- **Primary:** `lamp` fill, `lamp_light` top highlight, `lamp_dark` bottom edge, `ink` label. One per screen.
- **Secondary:** `frame_light` face, `brass` outline, `text` label.
- **Pressed:** inset 2 px, glow turns `lamp_light`.
- **Disabled:** avoid; keep enabled and explain on tap ("not enough funds").

### Bottom nav

Five equal square buttons in a bolted bar, icons as in the image: tent, map, people, crates, gear. Working names: **Camp · Map · Alliance · Supplies · Settings** (the crates button's purpose is still open, §9). Active button: `lamp` outline glow and `lamp_light` icon; others: `frame_light` face with `brass_icon` icons. Order runs from the start edge, so it mirrors in Arabic. Attention shows as one `alert` dot with an `ink` ring, never a count. Where Heroes and Reports live is still open (§9).

### Icons

Painted icons with ink outlines: resources in natural colors (sack, crate, coins, hand); nav icons in `brass_icon` line art on the button face. Readable at 20 px. No text baked in.

## 6. World and buildings at night

- **Base camp:** stone huts built into cliffs, lit from inside; lamplight pools at doors; olive trees; small figures far away, no faces.
- **Buildings:** regenerate every building at night, one per image, fixed angle, on a plain background. Lighting: cool moonlight from the top left, warm lamplight from doors and windows. A building's level shows through more lit windows and more detail, not through size alone.
- **World map:** moonlit. Ground uses `rock` and `rock_light`, not `night_deep`, so the map is not a black field. Lit lamps mark player camps; colonial posts use cold white light. Marches, markers and nameplates use `text` (10.6 on the ground) or `lamp_text` (6.7) with a dark outline. Check readability on a real phone outdoors at full brightness.
- **No faces** in any art (GDD §7).

## 7. Motion

- Pages: 150 ms fade or slide from the start edge.
- Lamp flicker on lit windows and the active nav glow: slow and subtle (2 to 4 s cycle, a few percent brightness), and switched off with reduced motion.
- No bouncing or flashing rewards. A finished timer makes the card's ribbon appear; it doesn't burst.

## 8. Implementation notes (Godot)

- Tokens become the constants in `apps/godot/scripts/hud/hud_theme.gd`, replacing the current `PANEL`, `BRASS`, `TERRACOTTA` and the rest. `HudTheme.build()` stays the single place that makes the Theme.
- Frames load as `StyleBoxTexture` from `apps/godot/art/ui/`, with the `StyleBoxFlat` fallback.
- `test_hud_theme.gd` should check token values and that the frame textures exist.
- Check every reskinned screen in English and Arabic at phone size, and screenshot the map (project rules).

## 9. Open questions

- What the crates button opens (supplies, inventory, training?).
- Where Heroes and Reports live, now that the nav has five fixed slots (inside Alliance? a player chip?).
- Story: the player frame, the tone, and who reviews the content (GDD §6, §12).
- Vietnam's palette values for the same tokens.
