# Design system: daylight camp and bronze

*Decided 3 Nov 2026. Replaces "night and lamp" (kept for history in `rejected-night-and-lamp.md`). Supersedes `docs/art-direction-v2.md` where they disagree.*

**The one reference is [`concepts/daylight-camp.jpg`](concepts/daylight-camp.jpg)**, for its look only. When this doc and the image disagree on content (faces, vehicles, flags, the real organisation names and the resource names shown in it), this doc and GDD §6 and §7 win. Every other file in `concepts/` is a rejected exploration.

## 1. The idea

A hidden mountain camp in full daylight, seen from above: sunlit sandstone, packed earth, whitewash and terracotta, dense enough to feel lived in. The interface is plain warm surfaces in simple rounded borders, so the buttons, icons and the busy painting are what stand out.

## 2. Decisions

| Topic | Decision (3 Nov) |
|---|---|
| Lighting | Daylight everywhere: base camp and world map |
| Base | One painting of the whole camp with every building and prop in it, so everything matches, shown in 3D: the buildings are blocks with the painting projected onto them. See §5 |
| Animated things | Left out of the painting: people and animals stand among the 3D buildings (hidden when behind one); smoke and flags are drawn on top |
| HUD and every screen | Plain, calm surfaces (24 Nov, the user wanted simple backgrounds): flat warm browns and paper, no planks, nails, stitches or engraving. Rounded borders in the buttons' shape (fat outline, lit top edge, lip), and rough poles lashed with rope round the big panels. No gold. No text baked in |
| Buttons | Chunky game buttons with a lip they sink into. Green goes, wood is neutral, blue is a tool, red leaves or closes, amber is the chosen tab, grey is off (`HudTheme.dress`) |
| Map's edge | An iron frontier: two fences with a raked strip between, watchtowers, and the same land going on into dust haze past it. Scenery only: no flags, signs or emblems, and not modelled on a named barrier (that would need the GDD §6 review) |
| Top bar | One board hanging from the screen's edge, 313 px tall whatever it shows. Each resource is a tray that fills with its own colour (amber near the cap, gold when full) with its icon standing out of it and outlined numbers; below, the player's portrait and the builders' tray, whose hammer swings (25 Nov, `Gauge`, `StatusPill`) |
| Tab bar | One plain rounded board with five even tabs: Heroes, Alliance, the green Base/Map switch in the middle, Reports, Settings (mirrored in Arabic). Big icons over their names; the open page's tab is raised. On every screen (`NavTab`, 24 Nov) |
| Fire | On colonial targets only (GDD §5, §6) |

## 3. Color tokens

The constants in `apps/godot/scripts/hud/hud_theme.gd` are the source of truth.

| Constant | Hex | Use |
|---|---|---|
| `PANEL` | `#282723` at 92% | The brightness the materials stay near |
| `BRASS` | `#A8834F` | Bronze hairlines |
| `RING` | `#E2C07A` | A hairline that marks something active |
| `TEXT` | `#E8D5B0` | Body text, numbers |
| `TEXT_SECOND` | `#BFA77C` | Labels, rates |
| `GOLD` | `#F0C060` | A full store, the chosen troop's name |
| `BUTTON_TEXT` | `#FFF3D6` | Text on every game button, with a dark outline |
| `LACKING` | `#F0795C` | A cost the player can't pay |
| `ALERT` | `#D9462B` | Attention dots only, with a light ring |

### Contrast (WCAG, on `PANEL`)

| Pair | Ratio | Verdict |
|---|---|---|
| `TEXT` | 10.4 | Body text, all sizes |
| `TEXT_SECOND` | 6.4 | Labels |
| `GOLD` | 8.8 | Status text |
| `LACKING` | 5.4 | Status text |
| `BUTTON_TEXT` on the button faces | 3 or more | Large bold labels with an outline (`test_hud_theme.gd`) |
| `ALERT` | 3.5 | Fails for text: dots only |
| `TEXT` on `BRASS` | 2.4 | Fails: never put text on a bronze rim |

Rules: Arabic at 11 to 13 px uses `TEXT`, not `TEXT_SECOND`. Names over the painting sit on dark plates, because the painting has no calm ground to read against.

## 4. Type

IBM Plex Sans Arabic for Arabic and Latin, regular and bold (`apps/godot/fonts`). Sizes at the 375 pt design width, scaled by `HudTheme.SCALE`: 11 small labels, 13 body, 15 titles and numbers, 18 page titles.

## 5. The base painting

Art and its limits: `apps/godot/art/camp/README.md`. Tap outlines and name positions: `apps/godot/scripts/base/camp_layout.gd`. The 3D blocks and where they stand: `apps/godot/tools/blender/camp_buildings.py` and `apps/godot/scripts/base/camp_models.gd`.

- **3D (21 Nov 2026):** each building is a rough Blender block placed where it is painted; the painting is projected onto the blocks and the ground from the camera it was painted from (30° up, 45° round), so at rest the base looks exactly like the painting and figures can walk behind buildings.

- **Making one:** Google Flow (Nano Banana 2.1) with the reference attached, listing every building and where it stands, and asking for no people, animals, vehicles, flags, smoke, fire or text. Download the 2K upscale.
- **Limits:** upgrades don't change a building's look yet (each level needs its own painting of that building), new buildings need a repaint and a new block, and each base skin is a whole painting.
- **Before launch:** repaint with all planned buildings (GDD §4.1), so the layout changes only once.
- **Vietnam** uses the Algerian painting until it has its own.

## 6. HUD art

Icons (24 Nov 2026): full-colour illustrated SVGs on a 256 px grid with a dark outline, lit from the top left, in the camp's materials (brass, steel, wood, parchment, whitewash, terracotta). All are drawn by `apps/godot/tools/icons/build_icons.py` into `apps/godot/art/icons/`; change the script, not the SVGs. They are never tinted. No gold star on red (it reads as a flag).

Pieces: `apps/godot/art/kit/`, made by our own scripts (`apps/godot/tools/ui/build_fills.py` for the seamless materials, `build_frames.py` for the borders and buttons; `build_frontier.py` for the map's fence and tower in `art/frontier/`); change the scripts, not the files. `HudTheme` hands them out as `FrameBox`es, which tile the material and repeat the frame's edges, so nothing is stretched; full pages stand on a `PageBackdrop`. `test_hud_theme.gd` checks text contrast on every material. The troop medallions and the clock, lock and storage icons are SVGs of the same set; the earlier painted bronze art is gone (in git history before 24 Nov). Frames must look right mirrored for Arabic, so no one-sided detail.

## 7. Content rules for art

- **No faces:** people are small, with no readable faces (GDD §7). This rules out the portrait in the reference.
- **Vehicles:** none on player columns until a historian has checked them. Player columns are foot and mules.
- **Red on the map** means colonial-held land, not rival alliances.
- **Flags and real organisation names** go to the historian review (GDD §6) before they appear.

## 8. Motion

Everything animated is cosmetic and computed from the clock, so it can't drift from the server's numbers. Slow and subtle: no bouncing or flashing rewards.

## 9. Open questions

- Who reviews flags, vehicles and organisation names (GDD §12).
- Vietnam's painting and palette.
- The other sheets (Reports, Alliance, Heroes) are not yet bronze.
