# The camp comes alive

Decided 27 Nov 2026: the camp shows the player's game state, the way Rockstar's camps do (RDR2): realism you can see, zero extra taps. Step 1 (the camp mirrors what you do) and step 2 (the camp grows with support) first; step 3 (camp talk on tap, generic everyday lines) after; the camp moving is a story feature for later (below).

Rules: everything is cosmetic and a pure function of `(summary, now_ms)`, worked out in the client from the state it already has; nothing ticks, nothing goes to the server. No faces (GDD §7), nothing violent in the camp (§6). Figures and props are our own Blender renders (`tools/blender/camp_figures.py`), drafted with `DRAFT=1`.

## What the client has

The base view gets only `levels`, `queue` and `now_ms` (`base_view.gd:85`). The session also has `state.training`, `state.wounded`, `state.marches` (stage from `marches_model.gd`), resource amounts and caps (`resource_display.gd`, `HudModel.chips()` near/full). There is no infirmary and no storehouse building; storage caps come from the HQ level.

## Step 1: the camp mirrors what you do

| Game state | What you see | Art |
|---|---|---|
| A building is upgrading (`queue`) | The scaffold (exists) plus 2 workers hammering at its base | new kind `worker` (standing loop) |
| Training (`state.training`) | 3 fighters drilling in the barracks yard | new kind `drill` (standing loop) |
| Wounded (`state.wounded` total > 0) | 1–3 figures sitting by the hero hall, count by wounded total | new kind `wounded` (seated, bandaged, still) |
| A resource near or at its cap (`HudModel.chips()`, so piles and HUD chips agree) | A pile at its producer: sacks at the farm, crates at the armory, a strongbox at the treasury; bigger when full | new props `sacks`, `crates`, `chest` (2 sizes) |
| A march left in the last 30 s | A column of fighters and a mule walks out along the road | existing `pack`, `mule` |
| A march returns within the next 30 s | Mules walk in loaded along the road | existing `mule`, `crate` |
| Food below 15 % of its cap | The farm chimney stops smoking and the farmer is gone | none |

## Step 2: the camp grows with support

- Support is spent (hero recruitment) and liberations are server-wide, so the lasting growth follows the **HQ level**, which the player earns with support: tents at fixed spots appear at HQ 2, 4, 6, 8; each tent adds one person sitting by it.
- Current support (amount / cap) adds up to 3 people round the cooking fire. Spending support makes them drift away again, never the tents.
- Cap of about 24 figures on screen, so the phone stays fast.

## Code

- `scripts/base/camp_summary.gd`: builds a small summary from the session (`upgrading`, `training`, `wounded`, `full` per resource, `food_low`, `marches` departure/return times, `hq`, `support_fill`). Pure, tested.
- `scripts/base/camp_cast.gd`: `cast(summary, now_ms) -> Array` of figures and props, same shape as `CampLife.figures()`. Spots, counts and thresholds are consts in `camp_layout.gd`. Pure, tested.
- `CampLife.figures()` merges the cast. Props and still figures (`wounded`, tents) have their own list and a one-frame draw path, not the 8×6 walk sheets (`cell()` and the sheet-size test assume those); they join the same y-sort. `CampLife` sheets are shared with `march_markers.gd`, so the walk-sheet path stays as it is.
- Spots in `camp_layout.gd`, checked against `building_at()` and `CampArt.is_behind` (no door data exists); workers follow whichever building is upgrading. `BaseView.set_state` takes the summary; `base_screen.gd` builds it.
- Tests (GUT): every row of the tables above, the march windows at their edges, time going backwards, the figure cap, sheets loading with the right size.

## Order

1. Code and GUT with existing kinds as stand-ins (`guard` drills, `pack` works, existing props for piles); screenshots of each state.
2. Then Blender, one kind at a time with `DRAFT=1`, looked at before the next: new poses in `camp_figures.py` (hammering, drilling, seated) and the props.

## Done when

Each state above shows in the browser at phone size (en and ar), screenshots in `map-shots/`, the world map still draws its columns (screenshot), GUT passes, phone check by the user later (no APK unless asked).

## Step 3: camp talk

Tapping someone (people and mules; not tents, piles or the fire) shows one short everyday line over their head for 4 s, in the
UI's own label style. Pools per kind (`camp.talk.<pool>.*`: worker, drill, wounded, rest, watch, fields, carry); when the camp
needs something, every other tap is a hint instead (`camp.talk.hint.*`: stores full, food low, builders idle, wounded). Tapping
again gives the next line. Lines are generic and everyday, no history (no historian review needed); the Arabic needs the usual
Arabic review. Code: `CampTalk` (pure), `CampLife.talker_at`, `BaseView.talk_at`; a tap on someone wins over the building under them.

## Later: the camp moves (story)

Real camps moved often to stay hidden. A story chapter will move the camp to a new site: a new ground and cliff set rendered in Blender, the same buildings at new spots, a short scene of the column leaving. It needs its own chapter text (historian review) and its own plan.
