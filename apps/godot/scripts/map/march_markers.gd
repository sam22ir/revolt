class_name MarchMarkers
extends Node2D
## The marching columns on the map: a line along each route and at the column's position a porter behind a mule on a coloured
## disc, walking the way it is going, and a fight marker at the target for a few seconds after arrival (scene/world/march-layer.ts). The positions come from
## MarchesModel for the time the caller gives, so nothing here ticks; it redraws only while there are marches to show. Columns keep
## a thumb's worth of screen size (a 30 CSS px disc), however far the map is zoomed.

const ROUTE_MINE := Color(0.88, 0.69, 0.25, 0.75)
const ROUTE_OTHER := Color(0.96, 0.92, 0.84, 0.35)
const MEDALLION_MINE := Color("e0b040")
const MEDALLION_OTHER := Color(0.96, 0.92, 0.84, 0.7)
const MEDALLION_RETURN := Color("9fb0d0")
const INK := Color("2b2a24")
## The column's animals and people, front to back, how far behind its middle each walks (in disc widths) and their size.
const COLUMN := [["mule", -0.32], ["pack", 0.42]]
## A bigger column: a guard ahead, the mule and porter, a guard behind.
const COLUMN_BIG := [["guard", -0.95], ["mule", -0.32], ["pack", 0.42], ["guard", 1.05]]
const FIGURE_DISCS := 2.1
const BATTLE := Color("d0573a")
## The medallion's width on screen, in CSS pixels.
const MEDALLION_PX := 30.0

## How long smoke rises from a colonial post the player's column beat, after the fight, in ms.
const SMOKE_MS := 75000.0
## Most figures in one column, and the troops each extra one stands for.
const MAX_FIGURES := 4
const TROOPS_PER_FIGURE := 25
const FLASH := Color(1.0, 0.86, 0.45)

var map: WorldMap
var _now := 0.0
var _zoom := 1.0
var _drawn := false
## The way each march walks, by march id (RoutePath), and which snapshot list it was made for.
var _paths := {}
var _paths_for: Array = []
## The player's own marches from the base state, by id: {"figures": int, "result": "victory"|"defeat"|""}.
var _own := {}
## How many times it drew (tests use it).
var draw_count := 0

## Figures in a column for this many troops: 2 for a small band, one more per TROOPS_PER_FIGURE, at most MAX_FIGURES.
static func figures_for(troops: int) -> int:
	return clampi(2 + troops / TROOPS_PER_FIGURE, 2, MAX_FIGURES)

## The player's own marches as the base state has them (troops and, after the fight, the result); others' columns stay small.
func set_own(marches: Array) -> void:
	_own = {}
	for m: Variant in marches:
		if not m is Dictionary or not m.has("id"):
			continue
		var total := 0
		for v: Variant in (m.get("troops", {}) as Dictionary).values():
			total += int(v)
		var result := ""
		if m.get("outcome") is Dictionary:
			result = String(m["outcome"].get("result", ""))
		_own[String(m["id"])] = {"figures": figures_for(total), "result": result}

func _path(m: Dictionary) -> PackedVector2Array:
	var id := String(m.get("id", ""))
	if _paths.has(id):
		return _paths[id]
	var p := RoutePath.route(map.route_grid(), Vector2i(int(m["from"]["x"]), int(m["from"]["y"])), Vector2i(int(m["to"]["x"]), int(m["to"]["y"])))
	if id != "":
		_paths[id] = p
	return p

func setup(m: WorldMap) -> void:
	map = m
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS

## The time and zoom to draw at. Cheap when there is nothing to show: it redraws once to clear, then not at all.
func tick(now_ms: float, view_zoom: float) -> void:
	_now = now_ms
	_zoom = maxf(view_zoom, 0.0001)
	var any := map != null and not map.snapshot.is_empty() and not (map.snapshot["marches"] as Array).is_empty()
	if any and map.snapshot["marches"] != _paths_for:
		# A new list: forget the ways of marches that are gone.
		_paths_for = map.snapshot["marches"]
		var keep := {}
		for m: Variant in _paths_for:
			if m is Dictionary and _paths.has(String(m.get("id", ""))):
				keep[String(m["id"])] = _paths[String(m["id"])]
		_paths = keep
	if any or _drawn:
		_drawn = any
		queue_redraw()

## A march with its two ends and its three times; anything else on the wire is skipped, not drawn.
static func _well_formed(m: Variant) -> bool:
	if not m is Dictionary:
		return false
	for end: String in ["from", "to"]:
		if not m.get(end) is Dictionary or not WireCheck.is_num(m[end].get("x")) or not WireCheck.is_num(m[end].get("y")):
			return false
	for key: String in ["departAt", "arriveAt", "returnAt"]:
		if not WireCheck.is_num(m.get(key)):
			return false
	return true

func _draw() -> void:
	if map == null or map.snapshot.is_empty():
		return
	draw_count += 1
	var radius := MEDALLION_PX / _zoom * 0.5
	var k := maxf(1.0, 1.0 / _zoom)
	var t_s := _now / 1000.0
	for m: Variant in map.snapshot["marches"]:
		if not _well_formed(m):
			continue
		var own: Dictionary = _own.get(String(m.get("id", "")), {})
		var target := Iso.tile_center(int(m["to"]["x"]), int(m["to"]["y"]))
		var since := _now - float(m["arriveAt"])
		# Smoke over a colonial post the player's column beat, dying away (GDD §6: fire on colonial targets only).
		if own.get("result", "") == "victory" and not MarchesModel.is_harvest(m) and since >= 0.0 and since < SMOKE_MS:
			var seed := fposmod(float(m["to"]["x"]) * 0.37 + float(m["to"]["y"]) * 0.11, 1.0)
			Puffs.draw(self, target + Vector2(-6.0 * k, -26.0 * k), t_s, k, seed, 7, Puffs.BURNING, minf(1.0, 1.4 * (1.0 - since / SMOKE_MS)), 150.0, 26.0, 1.7)
		var pos := MarchesModel.position(m, _now)
		# Done, or a harvest waiting at its site: nothing to draw on the road (the site marker shows it).
		if pos["leg"] == "done" or pos["leg"] == "at_site":
			continue
		var path := _path(m)
		var mine := bool(m.get("mine", false))
		_draw_route(path, ROUTE_MINE if mine else ROUTE_OTHER, k)
		var outbound: bool = pos["leg"] == "outbound"
		var f := float(pos["f"]) if outbound else 1.0 - float(pos["f"])
		var tile := RoutePath.point_at(path, f)
		var at := Iso.tile_to_world(tile.x, tile.y)
		var color := (MEDALLION_MINE if mine else MEDALLION_OTHER) if outbound else MEDALLION_RETURN
		_draw_disc(at, radius, color)
		var way := RoutePath.heading_at(path, f) * (1.0 if outbound else -1.0)
		var heading := Iso.tile_to_world(way.x, way.y) - Iso.tile_to_world(0.0, 0.0)
		if heading.length() > 0.001:
			_draw_column(at, radius, heading.normalized(), int(own.get("figures", 2)))
		if MarchesModel.battle_flash(m, _now):
			_draw_clash(target, since, k)

## The route as a trail on the ground, along the way the column walks.
func _draw_route(path: PackedVector2Array, color: Color, k: float) -> void:
	var pts := PackedVector2Array()
	for q: Vector2 in path:
		pts.append(Iso.tile_to_world(q.x, q.y))
	draw_polyline(pts, color, 3.0 * k, true)

## The fight at the target for a few seconds after arrival: dust kicked up, and shots flashing in it.
func _draw_clash(at: Vector2, since_ms: float, k: float) -> void:
	var fade := 1.0 - clampf(since_ms / MarchesModel.BATTLE_FLASH_MS, 0.0, 1.0)
	for j in 3:
		Puffs.draw(self, at + Vector2((j - 1) * 30.0 * k, -4.0 * k), since_ms / 1000.0 * 2.0, k, j * 0.31, 3, Puffs.DUST, minf(1.0, fade * 1.6), 46.0, 6.0, 1.6)
	var tick_n := floori(since_ms / 110.0)
	for j in 4:
		var h := GroundMath.hash01(tick_n, j, 91)
		if h > 0.55:
			continue
		var p := at + Vector2((GroundMath.hash01(tick_n, j, 92) - 0.5) * 70.0 * k, (GroundMath.hash01(tick_n, j, 93) - 0.7) * 34.0 * k)
		var r := (5.0 + h * 8.0) * k
		draw_circle(p, r * 2.0, Color(FLASH, 0.4 * fade))
		draw_circle(p, r * 0.8, Color(1, 1, 0.92, 0.95 * fade))

## A flat disc on the ground.
func _draw_disc(at: Vector2, radius: float, color: Color) -> void:
	draw_set_transform(at, 0.0, Vector2(1.0, 0.5))
	draw_circle(Vector2.ZERO, radius * 1.25, Color(color, color.a * 0.55))
	draw_arc(Vector2.ZERO, radius * 1.25, 0.0, TAU, 28, INK, 2.0)
	draw_set_transform(Vector2.ZERO)

## The column for this many figures, front to back.
static func column_for(figures: int) -> Array:
	if figures <= 2:
		return COLUMN.duplicate()
	if figures == 3:
		return COLUMN_BIG.slice(0, 3)
	return COLUMN_BIG.duplicate()

## The walkers, farthest first so the nearer one covers the other.
func _draw_column(at: Vector2, radius: float, dir: Vector2, figures := 2) -> void:
	var way := CampLife.way(dir)
	var frame := posmod(floori(_now / CampLife.STEP_MS), CampLife.STEPS)
	var size := radius * 2.0 * FIGURE_DISCS
	var foot := CampLife.FOOT / CampLife.CELL * size
	var walkers := column_for(figures)
	if dir.y < 0.0:
		walkers.reverse()
	walkers.reverse()
	for w: Array in walkers:
		var pos := at - dir * float(w[1]) * radius * 2.0
		draw_texture_rect_region(CampLife.sheet(w[0]), Rect2(pos - foot, Vector2(size, size)), CampLife.cell(w[0], way, frame))
