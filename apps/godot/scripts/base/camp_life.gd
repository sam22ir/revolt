class_name CampLife
extends Node2D
## The living camp: where the people and mules walking the routes in CampLayout and the ones standing are at any time (CampScene
## shows them in 3D among the buildings), and the smoke from the farm's chimney, which this layer draws on top of the picture. All
## of it is cosmetic and worked out from the time the caller gives, so nothing here ticks or touches game state, and it only
## redraws while the base screen is updating it.

const ART := "res://art/camp/life/"
## Walk cycles, in the order they alternate.
const FRAMES := {
	"crate": ["crate_a", "crate_b"],
	"pack": ["pack_a", "pack_b"],
	"mule": ["mule_a", "mule_b"],
	"guard": ["guard"],
	"farmer": ["farmer"],
}
## World units per texture px: the figures were all cut at one scale.
const FIGURE_SCALE := 0.46
const STEP_MS := 320.0
const BOB := 1.1
const GROUND_SHADOW := Color(0.2, 0.13, 0.07, 0.3)
const SMOKE_PUFFS := 5
const SMOKE_LIFE_S := 6.0
const SMOKE_RISE := 62.0
const SMOKE_COLOR := Color(0.96, 0.95, 0.92, 0.8)
## Soft enough to read as smoke, small enough to be cheap.
const PUFF_SIZE := 48

var draw_count := 0

var _puff: GradientTexture2D
var _now_ms := 0

## Makes the smoke puff. Called once.
func build() -> void:
	var fade := Gradient.new()
	fade.set_color(0, Color.WHITE)
	fade.set_color(1, Color(1, 1, 1, 0))
	_puff = GradientTexture2D.new()
	_puff.gradient = fade
	_puff.width = PUFF_SIZE
	_puff.height = PUFF_SIZE
	_puff.fill = GradientTexture2D.FILL_RADIAL
	_puff.fill_from = Vector2(0.5, 0.5)
	_puff.fill_to = Vector2(1.0, 0.5)

## The time to draw at.
func tick(now_ms: int) -> void:
	_now_ms = now_ms
	queue_redraw()

## Where a walker is, `distance` world units into its walk back and forth along `points`: {at, left} where `left` says it is
## heading towards smaller x. Any distance is fine, negative too, so a clock that steps back only moves it back.
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
			var heading_left := b.x < a.x
			return {"at": a.lerp(b, left_to_go / length), "left": heading_left != returning}
		left_to_go -= length
	var last: Vector2 = points[points.size() - 1]
	return {"at": last, "left": false}

## One puff of smoke at `now_ms`: {at, radius, alpha}. Each puff rises, drifts, swells and fades, then starts again.
static func puff(index: int, now_ms: int) -> Dictionary:
	var t := fposmod(now_ms / 1000.0 / SMOKE_LIFE_S + float(index) / SMOKE_PUFFS, 1.0)
	var drift := sin(t * 3.0 + index) * 5.0 + t * 10.0
	return {
		"at": CampLayout.CHIMNEY + Vector2(drift, -t * SMOKE_RISE),
		"radius": 7.0 + t * 20.0,
		"alpha": SMOKE_COLOR.a * smoothstep(0.0, 0.12, t) * (1.0 - t),
	}

## Everyone at `now_ms`, farthest first: {kind, at, left, frame, lift}.
static func figures(now_ms: int) -> Array:
	var out := []
	for w: Dictionary in CampLayout.WALKERS:
		var pose := along(CampLayout.ROUTES[w["route"]], float(w["start"]) + float(w["speed"]) * now_ms / 1000.0)
		var steps := now_ms / STEP_MS + float(w["start"])
		out.append({
			"kind": w["kind"],
			"at": pose["at"],
			"left": pose["left"],
			"frame": posmod(floori(steps), 2),
			"lift": BOB * absf(sin(steps * PI)),
		})
	for s: Dictionary in CampLayout.STANDING:
		out.append({"kind": s["kind"], "at": s["at"], "left": s["flip"], "frame": 0, "lift": 0.0})
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a["at"].y < b["at"].y)
	return out

func _draw() -> void:
	draw_count += 1
	for i in SMOKE_PUFFS:
		var p := puff(i, _now_ms)
		var r: float = p["radius"]
		draw_texture_rect(_puff, Rect2(p["at"] - Vector2(r, r), Vector2(r, r) * 2.0), false, Color(SMOKE_COLOR, p["alpha"]))
