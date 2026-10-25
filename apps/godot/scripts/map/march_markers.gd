class_name MarchMarkers
extends Node2D
## The marching columns on the map: a line along each route and a medallion at the column's position, with a small arrow that points the
## way it is going and a fight marker at the target for a few seconds after arrival (scene/world/march-layer.ts). The positions come from
## MarchesModel for the time the caller gives, so nothing here ticks; it redraws only while there are marches to show. Medallions keep
## a thumb's worth of screen size (30 CSS px), however far the map is zoomed.

const ROUTE_MINE := Color(0.88, 0.69, 0.25, 0.75)
const ROUTE_OTHER := Color(0.96, 0.92, 0.84, 0.35)
const MEDALLION_MINE := Color("e0b040")
const MEDALLION_OTHER := Color(0.96, 0.92, 0.84, 0.7)
const MEDALLION_RETURN := Color("9fb0d0")
const INK := Color("2b2a24")
const BATTLE := Color("d0573a")
## The medallion's width on screen, in CSS pixels.
const MEDALLION_PX := 30.0

var map: WorldMap
var _now := 0.0
var _zoom := 1.0
var _drawn := false
## How many times it drew (tests use it).
var draw_count := 0

func setup(m: WorldMap) -> void:
	map = m

## The time and zoom to draw at. Cheap when there is nothing to show: it redraws once to clear, then not at all.
func tick(now_ms: float, view_zoom: float) -> void:
	_now = now_ms
	_zoom = maxf(view_zoom, 0.0001)
	var any := map != null and not map.snapshot.is_empty() and not (map.snapshot["marches"] as Array).is_empty()
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
	for m: Variant in map.snapshot["marches"]:
		if not _well_formed(m):
			continue
		var pos := MarchesModel.position(m, _now)
		if pos["leg"] == "done":
			continue
		var a := Iso.tile_center(int(m["from"]["x"]), int(m["from"]["y"]))
		var b := Iso.tile_center(int(m["to"]["x"]), int(m["to"]["y"]))
		var mine := bool(m.get("mine", false))
		draw_line(a, b, ROUTE_MINE if mine else ROUTE_OTHER, 3.0)
		var at := Iso.tile_to_world(float(pos["x"]) + 0.5, float(pos["y"]) + 0.5)
		var outbound: bool = pos["leg"] == "outbound"
		var color := (MEDALLION_MINE if mine else MEDALLION_OTHER) if outbound else MEDALLION_RETURN
		draw_circle(at, radius, color)
		draw_arc(at, radius, 0.0, TAU, 24, INK, 2.0)
		var heading := (b - a) if outbound else (a - b)
		if heading.length() > 0.001:
			var dir := heading.normalized()
			var side := Vector2(-dir.y, dir.x)
			draw_colored_polygon(PackedVector2Array([at + dir * radius * 0.6, at - dir * radius * 0.4 + side * radius * 0.4, at - dir * radius * 0.4 - side * radius * 0.4]), INK)
		if MarchesModel.battle_flash(m, _now):
			var c := b + Vector2(0, -radius * 0.8)
			var r := radius * 0.8
			draw_line(c + Vector2(-r, -r), c + Vector2(r, r), BATTLE, 5.0)
			draw_line(c + Vector2(-r, r), c + Vector2(r, -r), BATTLE, 5.0)
