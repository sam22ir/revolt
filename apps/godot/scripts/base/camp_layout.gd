class_name CampLayout
extends RefCounted
## The base screen's geometry: where the buildings' names go, where people walk, and how the camp fits the screen. Coordinates are
## world units on a 768 x 1376 grid, half the painting px the Blender models use (CampArt has the pictures and tap outlines).
## Vietnam uses the Algerian camp until it has its own (GDD §11, M6).

const WORLD := Vector2(768.0, 1376.0)
## Farthest first, so the nearer one is drawn over it.
const BUILDINGS: Array[String] = ["hq", "watchtower", "barracks", "armory", "hero_hall", "treasury", "farm", "infirmary"]
## How far the camp can be zoomed in from the fit that covers the screen; past it the pictures would blur.
const MAX_ZOOM := 2.2
## A name goes this far below the building's front corner.
const LABEL_DROP := 14.0

## Where the people walk, along the painted road and yards and clear of every building's outline.
const ROUTES := {
	# It stops at the foot of the slope: the farm terrace beyond is the infirmary's.
	"road": [Vector2(768, 520), Vector2(700, 552), Vector2(600, 606), Vector2(500, 660), Vector2(400, 712), Vector2(305, 762), Vector2(230, 810), Vector2(190, 880), Vector2(225, 950), Vector2(290, 1005)],
	"yard": [Vector2(395, 440), Vector2(400, 520), Vector2(300, 585), Vector2(215, 560)],
	"cave": [Vector2(360, 436), Vector2(395, 455), Vector2(440, 520), Vector2(420, 570)],
}

## The people and animals on the ground. A walker goes back and forth along its route, starting `start` world units along it, at
## `speed` world units a second.
const WALKERS := [
	{"kind": "mule", "route": "road", "speed": 13.0, "start": 0.0},
	{"kind": "pack", "route": "road", "speed": 13.0, "start": 40.0},
	{"kind": "crate", "route": "road", "speed": 15.0, "start": 620.0},
	{"kind": "pack", "route": "yard", "speed": 11.0, "start": 0.0},
	{"kind": "crate", "route": "cave", "speed": 12.0, "start": 40.0},
]
## Standing figures face a direction (CampLife.WAYS).
const STANDING := [
	{"kind": "guard", "at": Vector2(199, 238), "dir": 6},
	{"kind": "guard", "at": Vector2(668, 290), "dir": 5},
	{"kind": "farmer", "at": Vector2(600, 1112), "dir": 1},
]

## What the camp shows of the player's game (CampCast, docs/camp-life-plan.md). Spots are world units on open ground, clear of
## every building's outline and the walkers' routes.
## Fighters drilling in the barracks yard while troops train, facing the barracks, to the right of its name plate.
const DRILL := [Vector2(330, 575), Vector2(362, 583), Vector2(394, 591)]
const DRILL_DIR := 3
## The wounded rest beside the infirmary, clear of its name plate: one figure per this many wounded, up to the spots there are.
const WOUNDED := [Vector2(322, 1106), Vector2(346, 1116), Vector2(300, 1096)]
const WOUNDED_PER_FIGURE := 10
## Where a full or nearly full producer piles its stock, by resource, clear of the name plates.
const PILES := {"food": Vector2(470, 1012), "materiel": Vector2(692, 478), "funds": Vector2(618, 772)}
## Food below this share of its cap: the farm's chimney goes cold and the farmer leaves.
const FOOD_LOW := 0.15
## The way out of the camp, from the bend below the hero hall to the top of the road; a march walks it out after it leaves
## and in again before it is back, at COLUMN_SPEED world units a second, its people COLUMN_GAP apart.
const WAY_OUT := [Vector2(190, 880), Vector2(230, 810), Vector2(305, 762), Vector2(400, 712), Vector2(500, 660), Vector2(600, 606), Vector2(700, 552), Vector2(768, 520)]
const COLUMN_SPEED := 18.0
const COLUMN_GAP := 22.0
const COLUMN_OUT: Array[String] = ["pack", "pack", "mule"]
const COLUMN_IN: Array[String] = ["mule", "crate", "mule"]
## Tents go up as the HQ grows, one at each level here, with someone sitting by each.
const TENTS := [
	{"hq": 2, "at": Vector2(110, 910)},
	{"hq": 4, "at": Vector2(645, 1210)},
	{"hq": 6, "at": Vector2(165, 1265)},
	{"hq": 8, "at": Vector2(600, 290)},
]
const BY_TENT := Vector2(24, 10)
## Support brings up to FIRE_PEOPLE more round the cooking fire, sitting FIRE_RADIUS from it.
const FIRE := Vector2(580, 1070)
const FIRE_PEOPLE := 3
const FIRE_RADIUS := 24.0
## Two workers stand in front of the building being upgraded, WORKER_ALONG of the way in from its side corners (the name plate
## hangs under the front corner): WORKER_DROP below its outline, looked for in steps of WORKER_STEP.
const WORKER_ALONG := 0.2
const WORKER_DROP := 4.0
const WORKER_STEP := 4.0
## At most this many people and props on top of the walkers and the standing ones, so a phone stays fast.
const MAX_CAST := 30

## The building whose outline holds `world`, or "" for empty ground. `looks` is the look each building shows (none: the first).
static func building_at(world: Vector2, looks: Dictionary = {}) -> String:
	for id in BUILDINGS:
		if Geometry2D.is_point_in_polygon(world, CampArt.outline(id, int(looks.get(id, 1)))):
			return id
	return ""

## The top middle of the building's name plate.
static func label_at(id: String, look: int) -> Vector2:
	var base := CampArt.base(id, look)
	return Vector2((base[0].x + base[2].x) * 0.5, minf(base[1].y + LABEL_DROP, WORLD.y))

## A point on the building's walls: the middle of its outline.
static func point_of(id: String, look: int) -> Vector2:
	var sum := Vector2.ZERO
	var outline := CampArt.outline(id, look)
	for p in outline:
		sum += p
	return sum / outline.size()

## How the camp sits on a `view` px screen with `top` px of HUD above and `nav` px of nav bar below: it always covers the
## whole space between them, so the scale is the larger of fitting the width and fitting that height.
## `zoom_by` is how far the player zoomed in from that. {zoom, low, high, start}: `low` and `high` bound the layer offset when
## panning, `start` is the offset to open at (the top of the camp under the HUD, centred across).
static func fit(view: Vector2, top: float, nav: float, zoom_by: float = 1.0) -> Dictionary:
	var zoom := maxf(view.x / WORLD.x, (view.y - top - nav) / WORLD.y) * zoom_by
	var size := WORLD * zoom
	var low := Vector2(view.x - size.x, view.y - nav - size.y)
	var high := Vector2(0.0, top)
	return {"zoom": zoom, "low": low, "high": high, "start": Vector2((low.x + high.x) * 0.5, high.y)}

## The layer offset that keeps the point under `about` in place when the scale goes from `from` to `to`.
static func zoomed(offset: Vector2, from: float, to: float, about: Vector2) -> Vector2:
	return about - (about - offset) * (to / from)
