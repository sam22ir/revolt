class_name CampLayout
extends RefCounted
## The base screen's geometry: one painting of the whole camp (art/camp/README.md) and, for each building painted into it, the
## tap outline, a point on its walls and the spot for its name. Coordinates are world units on a 768 x 1376 grid, whatever the
## texture's real size, so a sharper export of the same painting needs no retracing. Vietnam uses the Algerian painting until it
## has its own (GDD §11, M6).

const WORLD := Vector2(768.0, 1376.0)
const PAINTING := "res://art/camp/algeria_camp.webp"

## Traced by hand on the painting. Outlines must not overlap: a tap belongs to one building.
const REGIONS := {
	"hq": {
		"outline": [Vector2(250, 135), Vector2(400, 52), Vector2(450, 70), Vector2(532, 135), Vector2(530, 185), Vector2(478, 205), Vector2(320, 225), Vector2(250, 180)],
		"point": Vector2(400, 140),
		"label": Vector2(395, 228),
	},
	"barracks": {
		"outline": [Vector2(130, 395), Vector2(232, 345), Vector2(290, 372), Vector2(345, 395), Vector2(375, 500), Vector2(290, 530), Vector2(170, 550), Vector2(135, 470)],
		"point": Vector2(215, 430),
		"label": Vector2(250, 548),
	},
	"armory": {
		"outline": [Vector2(465, 455), Vector2(520, 400), Vector2(585, 362), Vector2(655, 420), Vector2(650, 470), Vector2(590, 495), Vector2(550, 515), Vector2(465, 490)],
		"point": Vector2(580, 430),
		"label": Vector2(565, 518),
	},
	"hero_hall": {
		"outline": [Vector2(30, 670), Vector2(180, 595), Vector2(262, 640), Vector2(262, 725), Vector2(130, 800), Vector2(30, 745)],
		"point": Vector2(145, 690),
		"label": Vector2(150, 802),
	},
	"treasury": {
		"outline": [Vector2(618, 715), Vector2(680, 668), Vector2(738, 715), Vector2(738, 800), Vector2(695, 808), Vector2(618, 775)],
		"point": Vector2(680, 740),
		"label": Vector2(678, 812),
	},
	"farm": {
		"outline": [Vector2(370, 965), Vector2(450, 870), Vector2(530, 790), Vector2(560, 775), Vector2(655, 835), Vector2(730, 960), Vector2(767, 985), Vector2(767, 1205), Vector2(690, 1170), Vector2(610, 1085), Vector2(560, 1078)],
		"point": Vector2(560, 930),
		"label": Vector2(540, 1082),
	},
}

## Where the people walk, along the painted road and yards and clear of every building's outline.
const ROUTES := {
	"road": [Vector2(768, 505), Vector2(610, 590), Vector2(450, 690), Vector2(300, 752), Vector2(200, 815), Vector2(165, 880), Vector2(205, 945), Vector2(285, 1000), Vector2(345, 1035)],
	"yard": [Vector2(395, 440), Vector2(400, 520), Vector2(300, 585), Vector2(200, 570)],
	"cave": [Vector2(360, 405), Vector2(395, 450), Vector2(440, 520), Vector2(420, 570)],
}

## The people and animals on top of the painting. A walker goes back and forth along its route, starting `start` world units
## along it, at `speed` world units a second. Figures are art/camp/life/ pieces.
const WALKERS := [
	{"kind": "mule", "route": "road", "speed": 13.0, "start": 0.0},
	{"kind": "pack", "route": "road", "speed": 13.0, "start": 34.0},
	{"kind": "crate", "route": "road", "speed": 15.0, "start": 620.0},
	{"kind": "pack", "route": "yard", "speed": 11.0, "start": 0.0},
	{"kind": "crate", "route": "cave", "speed": 12.0, "start": 40.0},
]
const STANDING := [
	{"kind": "guard", "at": Vector2(235, 192), "flip": false},
	{"kind": "guard", "at": Vector2(665, 288), "flip": true},
	{"kind": "farmer", "at": Vector2(690, 1100), "flip": true},
]
## The top of the farm's painted chimney.
const CHIMNEY := Vector2(546, 782)

static func outline(id: String) -> PackedVector2Array:
	return PackedVector2Array(REGIONS[id]["outline"])

## The building whose outline holds `world`, or "" for empty ground.
static func building_at(world: Vector2) -> String:
	for id: String in REGIONS:
		if Geometry2D.is_point_in_polygon(world, outline(id)):
			return id
	return ""

## How the painting sits on a `view` px screen with `top` px of HUD above and `nav` px of nav bar below: it always covers the
## whole space between them, so the scale is the larger of fitting the width and fitting that height.
## {zoom, low, high, start}: `low` and `high` bound the layer offset when panning, `start` is the offset to open at (the top
## of the painting under the HUD, centred across).
static func fit(view: Vector2, top: float, nav: float) -> Dictionary:
	var zoom := maxf(view.x / WORLD.x, (view.y - top - nav) / WORLD.y)
	var size := WORLD * zoom
	var low := Vector2(view.x - size.x, view.y - nav - size.y)
	var high := Vector2(0.0, top)
	return {"zoom": zoom, "low": low, "high": high, "start": Vector2((low.x + high.x) * 0.5, high.y)}
