class_name FeaturePainter
extends Node2D
## Dry riverbeds (wadis), dirt roads and oasis pools, drawn in code on the ground from the shaped polylines
## (feature-layer.ts): same colours, widths, round joins (a disc every third point) and pebbles. Drawn once.

const WADI_BANK := Color("9c784a")
const WADI_BED := Color("c9b48a")
const WADI_SHINE := Color("dccaa0")
const PEBBLE := Color("6f5a40", 0.55)
const ROAD_EDGE := Color("b09062")
const ROAD_TOP := Color("cdae7f")
const OASIS_RIM := Color("6e6236", 0.55)
const OASIS_WATER := Color("3d7a7e")
const OASIS_SHINE := Color("8cc0b8", 0.55)
## Round joins on every few points only: after the smoothing passes neighbouring segments are nearly straight.
const JOIN_EVERY := 3

var _wadis: Array = []
var _roads: Array = []
var _oases: Array = []

## `wadis` and `roads` are shaped polylines (FeatureShape), `oases` are Vector2i tiles.
func setup(wadis: Array, roads: Array, oases: Array) -> void:
	_wadis = wadis
	_roads = roads
	_oases = oases
	queue_redraw()

func _draw() -> void:
	var th := Iso.TILE_H
	for w: Array in _wadis:
		_stroke(w, WADI_BANK, th * 0.9)
		_stroke(w, WADI_BED, th * 0.66)
		# Pale gravel bars only where the bed is wide, so the middle line breaks up.
		_stroke(w, WADI_SHINE, th * 0.22, 1.05)
		_pebbles(w)
	for r: Array in _roads:
		_stroke(r, ROAD_EDGE, th * 0.3)
		_stroke(r, ROAD_TOP, th * 0.17)
	for o: Vector2i in _oases:
		var c := Iso.tile_center(o.x, o.y)
		_ellipse(c, Iso.TILE_W * 1.6, Iso.TILE_H * 1.6, OASIS_RIM)
		_ellipse(c, Iso.TILE_W * 1.3, Iso.TILE_H * 1.2, OASIS_WATER)
		_ellipse(c + Vector2(-Iso.TILE_W * 0.18, -Iso.TILE_H * 0.14), Iso.TILE_W * 0.55, Iso.TILE_H * 0.32, OASIS_SHINE)

## An ellipse of full width `w` and height `h` centred on `c`.
func _ellipse(c: Vector2, w: float, h: float, color: Color) -> void:
	draw_set_transform(c, 0.0, Vector2(1.0, h / w))
	draw_circle(Vector2.ZERO, w * 0.5, color)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

## Strokes a polyline with round joins, scaling `width` by each point's width factor. Points whose factor is under `min_w` are skipped.
func _stroke(pts: Array, color: Color, width: float, min_w: float = 0.0) -> void:
	var prev: Array = []
	for i in pts.size():
		var p: Array = pts[i]
		var on: bool = p[2] >= min_w
		var at := Iso.tile_to_world(p[0], p[1])
		if not prev.is_empty() and on and prev[2] >= min_w:
			draw_line(Iso.tile_to_world(prev[0], prev[1]), at, color, width * (p[2] + prev[2]) * 0.5, true)
		if on and (i % JOIN_EVERY == 0 or i == pts.size() - 1):
			_ellipse(at, width * p[2], width * p[2] * 0.6, color)
		prev = p

## A few dark stones scattered along a riverbed.
func _pebbles(pts: Array) -> void:
	var i := 0
	while i < pts.size():
		var p: Array = pts[i]
		if GroundMath.hash01(int(floor(p[0] * 7.0)), int(floor(p[1] * 7.0)), i * 13) <= 0.45:
			var at := Iso.tile_to_world(p[0] + (GroundMath.hash01(i, 1, 90) - 0.5) * 0.4, p[1] + (GroundMath.hash01(i, 2, 90) - 0.5) * 0.4)
			var r := 1.5 + GroundMath.hash01(i, 3, 90) * 2.0
			_ellipse(at, r * 2.0, r * 1.2, PEBBLE)
		i += 3
