class_name CampLife
extends Node2D
## The living camp: where the people and mules walking the routes in CampLayout and the ones standing are at any time (CampPicture
## draws them among the buildings), and the smoke from the farm's chimney, which this layer draws on top of the picture. All of it
## is cosmetic and worked out from the time the caller gives, so nothing here ticks or touches game state, and it only redraws
## while the base screen is updating it.

const ART := "res://art/camp/life/"
## A sheet has a row per step of the walk and a column per direction (tools/blender/camp_figures.py): 0 is to the right of the
## screen and they go anticlockwise on the ground, so 2 is away from the viewer and 6 towards.
const KINDS: Array[String] = ["crate", "pack", "mule", "guard", "farmer", "worker", "drill", "sitting", "wounded"]
## Things that keep still (tents, piles, the fire): one picture each, at the sheets' scale, its foot at the bottom middle
## STILL_FOOT of the way down. One not rendered yet is not drawn.
const STILL_ART := "res://art/camp/still/"
const STILL_FOOT := 0.8
const STEPS := 6
const WAYS := 8
## One cell in sheet px, and where the feet are in it.
const CELL := Vector2(168.0, 168.0)
const FOOT := Vector2(84.0, 138.0)
## World units per sheet px (the sheets have 1.5 px per painting px, the world half).
const FIGURE_SCALE := 1.0 / 3.0
const STEP_MS := 140.0
## The area a tap on someone lands on, in world units round their feet: wider than they are, so a finger finds them.
const TAP_WIDTH := 26.0
const TAP_HEIGHT := 48.0
const TAP_BELOW := 8.0
const GROUND_SHADOW := Color(0.2, 0.13, 0.07, 0.34)
const SMOKE_PUFFS := 5
const SMOKE_LIFE_S := 6.0
const SMOKE_RISE := 62.0
const SMOKE_COLOR := Color(0.96, 0.95, 0.92, 0.8)
## Dust kicked up by the workers at a building being upgraded: a few low sandy puffs at each, short-lived, in step with the hammer.
const DUST_PUFFS := 3
const DUST_LIFE_S := 1.2
const DUST_RISE := 16.0
const DUST_COLOR := Color(0.97, 0.93, 0.84, 0.85)
## Soft enough to read as smoke, small enough to be cheap.
const PUFF_SIZE := 48

var draw_count := 0

## Kept, so a sheet is read from disk once.
static var _sheets := {}
static var _stills := {}

var _puff: GradientTexture2D
var _now_ms := 0
var _chimney := Vector2.ZERO
var _smoke := true
var _dust: Array = []

## Makes the smoke puff. Called once.
func build() -> void:
	_puff = puff_texture()

## A soft white disc: smoke, and tinted dark the shadow under a figure.
static func puff_texture() -> GradientTexture2D:
	var fade := Gradient.new()
	fade.set_color(0, Color.WHITE)
	fade.set_color(1, Color(1, 1, 1, 0))
	var tex := GradientTexture2D.new()
	tex.gradient = fade
	tex.width = PUFF_SIZE
	tex.height = PUFF_SIZE
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	return tex

static func sheet(kind: String) -> Texture2D:
	if not _sheets.has(kind):
		_sheets[kind] = load(ART + kind + ".webp")
	return _sheets[kind]

## The sheet a kind walks or works with, or "" for a thing that keeps still.
static func sheet_kind(kind: String) -> String:
	return kind if KINDS.has(kind) else ""

## A still thing's picture, or null while it has none.
static func still(kind: String) -> Texture2D:
	if not _stills.has(kind):
		var path := STILL_ART + kind + ".webp"
		_stills[kind] = load(path) if ResourceLoader.exists(path) else null
	return _stills[kind]

## The part of a kind's sheet that shows a direction and step.
static func cell(_kind: String, dir: int, frame: int) -> Rect2:
	return Rect2(Vector2(dir, frame) * CELL, CELL)

## How wide its shadow is, in world units.
static func width_of(kind: String) -> float:
	match kind:
		"mule":
			return 34.0
		"sitting", "wounded":
			return 24.0
	return 17.0

## The direction (0 to 7) that walks the way `step` points on the screen. The ground is seen from 30° up, so away counts double.
static func way(step: Vector2) -> int:
	return posmod(roundi(Vector2(step.x, -step.y * 2.0).angle() / (TAU / WAYS)), WAYS)

## The time to draw at, the top of the farm's chimney, whether it smokes (not when food runs low), and where dust rises (the
## feet of the workers at a building being upgraded).
func tick(now_ms: int, chimney: Vector2, smoke := true, dust: Array = []) -> void:
	_now_ms = now_ms
	_chimney = chimney
	_smoke = smoke
	_dust = dust
	queue_redraw()

## Where the dust rises at `now_ms`: the feet of the workers CampCast puts at the building being upgraded.
static func dust_spots(summary: Dictionary, now_ms: int) -> Array:
	return CampCast.cast(summary, now_ms).filter(func(f: Dictionary) -> bool: return f["kind"] == "worker").map(
		func(f: Dictionary) -> Vector2: return f["at"])

## One puff of dust at `now_ms`, `at` from the worker's feet: {at, radius, alpha}. It rises a little, spreads and settles.
static func dust(index: int, now_ms: int) -> Dictionary:
	var t := fposmod(now_ms / 1000.0 / DUST_LIFE_S + float(index) / DUST_PUFFS, 1.0)
	var side := (float(index) - (DUST_PUFFS - 1) * 0.5) * 7.0
	return {
		"at": Vector2(side * (0.6 + t), -t * DUST_RISE),
		"radius": 6.0 + t * 12.0,
		"alpha": DUST_COLOR.a * smoothstep(0.0, 0.15, t) * (1.0 - t),
	}

## Where a walker is, `distance` world units into its walk back and forth along `points`: {at, way} where `way` is the direction it
## is heading. Any distance is fine, negative too, so a clock that steps back only moves it back.
static func along(points: Array, distance: float) -> Dictionary:
	var total := 0.0
	for i in range(1, points.size()):
		total += (points[i] as Vector2).distance_to(points[i - 1])
	var d := fposmod(distance, total * 2.0)
	var returning := d >= total
	var left_to_go := total * 2.0 - d if returning else d
	for i in range(1, points.size()):
		var a: Vector2 = points[i - 1]
		var b: Vector2 = points[i]
		var length := a.distance_to(b)
		if left_to_go <= length:
			return {"at": a.lerp(b, left_to_go / length), "way": way(a - b if returning else b - a)}
		left_to_go -= length
	var last: Vector2 = points[points.size() - 1]
	return {"at": last, "way": 0}

## One puff of smoke at `now_ms`: {at, radius, alpha}, `at` from the chimney's top. Each puff rises, drifts, swells and fades, then starts again.
static func puff(index: int, now_ms: int) -> Dictionary:
	var t := fposmod(now_ms / 1000.0 / SMOKE_LIFE_S + float(index) / SMOKE_PUFFS, 1.0)
	var drift := sin(t * 3.0 + index) * 5.0 + t * 10.0
	return {
		"at": Vector2(drift, -t * SMOKE_RISE),
		"radius": 7.0 + t * 20.0,
		"alpha": SMOKE_COLOR.a * smoothstep(0.0, 0.12, t) * (1.0 - t),
	}

## Everyone at `now_ms`, farthest first: {id, kind, at, dir, frame}; `id` names who it is, so a speech bubble can follow them. `summary` (CampSummary) adds what shows the player's game
## (CampCast); with food low the farmer is gone.
static func figures(now_ms: int, summary: Dictionary = {}) -> Array:
	var out := []
	for i in CampLayout.WALKERS.size():
		var w: Dictionary = CampLayout.WALKERS[i]
		var pose := along(CampLayout.ROUTES[w["route"]], float(w["start"]) + float(w["speed"]) * now_ms / 1000.0)
		out.append({"id": "walk%d" % i, "kind": w["kind"], "at": pose["at"], "dir": pose["way"], "frame": posmod(floori(now_ms / STEP_MS + float(w["start"])), STEPS)})
	for i in CampLayout.STANDING.size():
		var s: Dictionary = CampLayout.STANDING[i]
		if s["kind"] == "farmer" and summary.get("food_low", false):
			continue
		out.append({"id": "stand%d" % i, "kind": s["kind"], "at": s["at"], "dir": s["dir"], "frame": 0})
	out.append_array(CampCast.cast(summary, now_ms))
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a["at"].y < b["at"].y)
	return out

## Who talks at `world` among `list` (CampLife.figures): the one in front whose body holds the point, or {} for no one.
static func talker_at(list: Array, world: Vector2) -> Dictionary:
	var best := {}
	for f: Dictionary in list:
		if not CampTalk.talks(f["kind"]):
			continue
		var at: Vector2 = f["at"]
		var half := TAP_WIDTH * (2.0 if f["kind"] == "mule" else 1.0) * 0.5
		if Rect2(at.x - half, at.y - TAP_HEIGHT, half * 2.0, TAP_HEIGHT + TAP_BELOW).has_point(world) and (best.is_empty() or at.y > best["at"].y):
			best = f
	return best

func _draw() -> void:
	draw_count += 1
	for spot: Vector2 in _dust:
		for i in DUST_PUFFS:
			var d := dust(i, _now_ms)
			var r: float = d["radius"]
			draw_texture_rect(_puff, Rect2(spot + d["at"] - Vector2(r, r), Vector2(r, r) * 2.0), false, Color(DUST_COLOR, d["alpha"]))
	if not _smoke:
		return
	for i in SMOKE_PUFFS:
		var p := puff(i, _now_ms)
		var r: float = p["radius"]
		draw_texture_rect(_puff, Rect2(_chimney + p["at"] - Vector2(r, r), Vector2(r, r) * 2.0), false, Color(SMOKE_COLOR, p["alpha"]))
