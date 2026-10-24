class_name FeaturePainter
extends Node2D
## Dry riverbeds (wadis), dirt roads and oasis pools on the ground, from the shaped polylines (feature-layer.ts): same colours,
## widths and pebbles. Built once into one mesh with a surface per colour layer, drawn back to front: the 640-point paths used
## to be thousands of antialiased `draw_line` calls kept and re-rendered every frame (about 300,000 canvas objects on the map
## screen); as triangle strips they are a handful of draw calls. A stroke is a strip of constant-width quads along the path
## (half-width = width x the point's width factor / 2) with a round cap at each end of every run; paths are smooth (Chaikin),
## so no joins are needed. Edges are not antialiased.

const WADI_BANK := Color("9c784a")
const WADI_BED := Color("c9b48a")
const WADI_SHINE := Color("dccaa0")
const PEBBLE := Color("6f5a40", 0.55)
const ROAD_EDGE := Color("b09062")
const ROAD_TOP := Color("cdae7f")
const OASIS_RIM := Color("6e6236", 0.55)
const OASIS_WATER := Color("3d7a7e")
const OASIS_SHINE := Color("8cc0b8", 0.55)
## Corners of the polygon that stands for an ellipse (caps, pebbles, pools).
const ELLIPSE_SEGMENTS := 14

var _wadis: Array = []
var _roads: Array = []
var _oases: Array = []
var _mesh := MeshInstance2D.new()

## Triangle count of the built mesh (tests and tooling).
var triangle_count := 0

func _ready() -> void:
	add_child(_mesh)

## `wadis` and `roads` are shaped polylines (FeatureShape), `oases` are Vector2i tiles.
func setup(wadis: Array, roads: Array, oases: Array) -> void:
	_wadis = wadis
	_roads = roads
	_oases = oases
	_build()

func surface_count() -> int:
	return 0 if _mesh.mesh == null else (_mesh.mesh as ArrayMesh).get_surface_count()

func _build() -> void:
	var th := Iso.TILE_H
	# Back to front, as the Phaser layer paints them: wadi bank, bed, gravel bars, pebbles, then roads, then pools.
	var layers: Array[StrokeLayer] = []
	var bank := StrokeLayer.new(WADI_BANK)
	var bed := StrokeLayer.new(WADI_BED)
	var shine := StrokeLayer.new(WADI_SHINE)
	var pebbles := StrokeLayer.new(PEBBLE)
	var edge := StrokeLayer.new(ROAD_EDGE)
	var top := StrokeLayer.new(ROAD_TOP)
	for w: Array in _wadis:
		bank.stroke(w, th * 0.9)
		bed.stroke(w, th * 0.66)
		# Pale gravel bars only where the bed is wide, so the middle line breaks up.
		shine.stroke(w, th * 0.22, 1.05)
		_pebbles(w, pebbles)
	for r: Array in _roads:
		edge.stroke(r, th * 0.3)
		top.stroke(r, th * 0.17)
	var rim := StrokeLayer.new(OASIS_RIM)
	var water := StrokeLayer.new(OASIS_WATER)
	var gleam := StrokeLayer.new(OASIS_SHINE)
	for o: Vector2i in _oases:
		var c := Iso.tile_center(o.x, o.y)
		rim.ellipse(c, Iso.TILE_W * 1.6, Iso.TILE_H * 1.6)
		water.ellipse(c, Iso.TILE_W * 1.3, Iso.TILE_H * 1.2)
		gleam.ellipse(c + Vector2(-Iso.TILE_W * 0.18, -Iso.TILE_H * 0.14), Iso.TILE_W * 0.55, Iso.TILE_H * 0.32)
	layers.append_array([bank, bed, shine, pebbles, edge, top, rim, water, gleam])
	var mesh := ArrayMesh.new()
	triangle_count = 0
	for g in layers:
		if g.indices.is_empty():
			continue
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = g.vertices
		arrays[Mesh.ARRAY_COLOR] = g.colors
		arrays[Mesh.ARRAY_INDEX] = g.indices
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		triangle_count += g.indices.size() / 3
	_mesh.mesh = mesh

## A few dark stones scattered along a riverbed.
func _pebbles(pts: Array, into: StrokeLayer) -> void:
	var i := 0
	while i < pts.size():
		var p: Array = pts[i]
		if GroundMath.hash01(int(floor(p[0] * 7.0)), int(floor(p[1] * 7.0)), i * 13) <= 0.45:
			var at := Iso.tile_to_world(p[0] + (GroundMath.hash01(i, 1, 90) - 0.5) * 0.4, p[1] + (GroundMath.hash01(i, 2, 90) - 0.5) * 0.4)
			var r := 1.5 + GroundMath.hash01(i, 3, 90) * 2.0
			into.ellipse(at, r * 2.0, r * 1.2)
		i += 3

## Vertices, colours and triangles of one colour layer.
class StrokeLayer:
	var color: Color
	var vertices := PackedVector2Array()
	var colors := PackedColorArray()
	var indices := PackedInt32Array()

	func _init(c: Color) -> void:
		color = c

	func _vertex(at: Vector2) -> int:
		vertices.append(at)
		colors.append(color)
		return vertices.size() - 1

	## An ellipse of full width `w` and height `h` centred on `c`, as a triangle fan.
	func ellipse(c: Vector2, w: float, h: float) -> void:
		var centre := _vertex(c)
		var first := -1
		var prev := -1
		for k in FeaturePainter.ELLIPSE_SEGMENTS:
			var a := TAU * float(k) / float(FeaturePainter.ELLIPSE_SEGMENTS)
			var v := _vertex(c + Vector2(cos(a) * w * 0.5, sin(a) * h * 0.5))
			if prev >= 0:
				indices.append_array([centre, prev, v])
			else:
				first = v
			prev = v
		indices.append_array([centre, prev, first])

	## Strokes a polyline `pts` ([tile x, tile y, width factor] per point): a strip whose half-width at each point is
	## `width` x factor / 2, with a round cap at each end. Points whose factor is under `min_w` split the path into runs.
	func stroke(pts: Array, width: float, min_w: float = 0.0) -> void:
		var run: Array[Vector3] = []
		for p: Array in pts:
			if float(p[2]) >= min_w:
				var at := Iso.tile_to_world(p[0], p[1])
				run.append(Vector3(at.x, at.y, float(p[2])))
			else:
				_strip(run, width)
				run = []
		_strip(run, width)

	func _strip(run: Array[Vector3], width: float) -> void:
		if run.size() < 2:
			return
		var prev_left := -1
		var prev_right := -1
		for i in run.size():
			var here := Vector2(run[i].x, run[i].y)
			var ahead := Vector2(run[mini(i + 1, run.size() - 1)].x, run[mini(i + 1, run.size() - 1)].y)
			var behind := Vector2(run[maxi(i - 1, 0)].x, run[maxi(i - 1, 0)].y)
			var dir := (ahead - behind).normalized()
			if dir == Vector2.ZERO:
				dir = Vector2.RIGHT
			var n := Vector2(-dir.y, dir.x) * width * run[i].z * 0.5
			var left := _vertex(here + n)
			var right := _vertex(here - n)
			if prev_left >= 0:
				indices.append_array([prev_left, prev_right, left, prev_right, right, left])
			prev_left = left
			prev_right = right
		# Round caps; the vertical radius is squashed like the old joins (the ground is seen at an angle).
		for end in [0, run.size() - 1]:
			var w: float = width * run[end].z
			ellipse(Vector2(run[end].x, run[end].y), w, w * 0.6)
