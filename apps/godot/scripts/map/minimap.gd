class_name Minimap
extends Control
## A small overview of the whole map in its own orientation (apps/client ui/minimap.ts): regions still held or liberated, region
## borders, targets, camps, alliance HQs and the player's base, and an outline of what the camera shows. Never mirrored in Arabic,
## since the map does not flip either. A tap jumps the camera to the tile under it.

signal jump(tile: Vector2i)

## Width in mockup px; the diamond is half as tall.
const WIDTH := 150.0
const HELD := Color("74604a")
const LIBERATED := Color("e0b040")
const BORDER := Color("3a2a1e")
const PAPER := Color("f4ead6")
const NPC := Color("b4583a")
const NPC_STRONG := Color("6e1a14")
const OTHER_BASE := Color("a7b6c2")
const ALLY := Color("2f9e8f")
const HQ_OTHER := Color("6a55a8")

var _snap: Dictionary = {}
var _regions := PackedInt32Array()
var _base_key := ""
var _texture: ImageTexture
## The camera's view as four tile points (fractional), or empty.
var _view: Array = []

func _init() -> void:
	layout_direction = Control.LAYOUT_DIRECTION_LTR
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(HudTheme.px(WIDTH), HudTheme.px(WIDTH) / 2.0)
	tooltip_text = ""

func width_px() -> float:
	return custom_minimum_size.x

## New map data: rebakes the regions only when the map or the liberated set changed. `regions` is the region id per tile
## (WorldMap.region_grid); empty computes it here, which is slower.
func set_snapshot(snap: Dictionary, now_ms: int, regions := PackedInt32Array()) -> void:
	_snap = snap
	if snap.is_empty():
		return
	var seed := int(snap["terrainSeed"])
	var size := int(snap["size"])
	var held := Balance.liberated_regions(snap.get("liberations", []), now_ms).keys()
	held.sort()
	var key := "%d|%d|%s" % [seed, size, held]
	if key != _base_key:
		_base_key = key
		_bake(seed, size, held, regions)
	queue_redraw()

## Where the camera looks, as the four corners of the free band in tile coordinates.
func set_view(corners: Array) -> void:
	_view = corners
	queue_redraw()

## Texels per tile of the baked picture: enough for a thin border line once it is drawn as a diamond.
const TEXELS := 4

## The regions in tile space (TEXELS per tile, one rectangle per tile and per border), drawn as the diamond by _draw's transform.
func _bake(seed: int, size: int, liberated: Array, regions: PackedInt32Array) -> void:
	if regions.size() == size * size:
		_regions = regions
	else:
		var cell := int(Balance.data()["map"]["regionCell"])
		_regions.resize(size * size)
		for y in size:
			for x in size:
				_regions[y * size + x] = MapMath.region_at(seed, x, y, size, cell)
	var image := Image.create_empty(size * TEXELS, size * TEXELS, false, Image.FORMAT_RGBA8)
	for y in size:
		for x in size:
			var id := _regions[y * size + x]
			image.fill_rect(Rect2i(x * TEXELS, y * TEXELS, TEXELS, TEXELS), LIBERATED if liberated.has(id) else HELD)
	for y in size:
		for x in size:
			var id := _regions[y * size + x]
			for step: Vector2i in [Vector2i(1, 0), Vector2i(0, 1)]:
				var nx := x + step.x
				var ny := y + step.y
				if nx >= size or ny >= size:
					continue
				var other := _regions[ny * size + nx]
				if other == id:
					continue
				var c := PAPER if liberated.has(id) or liberated.has(other) else BORDER
				c.a = 0.8
				if step.x == 1:
					image.fill_rect(Rect2i(nx * TEXELS - 1, y * TEXELS, 2, TEXELS), c)
				else:
					image.fill_rect(Rect2i(x * TEXELS, ny * TEXELS - 1, TEXELS, 2), c)
	_texture = ImageTexture.create_from_image(image)

func _draw() -> void:
	if _texture == null or _snap.is_empty():
		return
	var w := width_px()
	var size := int(_snap["size"])
	# Tile space to the diamond: x grows down-right, y down-left, the top corner at the middle of the top edge.
	draw_set_transform_matrix(Transform2D(Vector2(w / (2.0 * size), w / (4.0 * size)), Vector2(-w / (2.0 * size), w / (4.0 * size)), Vector2(w / 2.0, 0.0)))
	draw_texture_rect(_texture, Rect2(0, 0, size, size), false)
	draw_set_transform_matrix(Transform2D.IDENTITY)
	var rim := PackedVector2Array([Vector2(w / 2.0, 0.0), Vector2(w, w / 4.0), Vector2(w / 2.0, w / 2.0), Vector2(0.0, w / 4.0), Vector2(w / 2.0, 0.0)])
	draw_polyline(rim, Color(0.15, 0.1, 0.07, 0.95), HudTheme.px(2.5), true)
	draw_polyline(rim, HudTheme.BRASS, HudTheme.px(1.0), true)
	var at := func(x: int, y: int) -> Vector2: return MinimapMath.tile_to_minimap(size, x + 0.5, y + 0.5, w)
	# Dots shrink on a bigger map, so hundreds of targets do not cover it.
	var r := w / 132.0 * 0.75 * clampf(sqrt(64.0 / maxf(size, 1)), 0.5, 1.0)
	for n: Dictionary in _snap.get("npcs", []):
		var strong := int(n["level"]) >= int(Balance.data()["npcLevels"].size()) or String(n.get("kind", "")) == "fortified_line"
		draw_circle(at.call(int(n["x"]), int(n["y"])), (2.4 if strong else 1.5) * r, NPC_STRONG if strong else NPC)
	var mine: Dictionary = {}
	for b: Dictionary in _snap.get("bases", []):
		if b.get("mine", false):
			mine = b
	for b: Dictionary in _snap.get("bases", []):
		if b.get("mine", false):
			continue
		var ally: bool = not mine.is_empty() and b.get("alliance") != null and b.get("alliance") == mine.get("alliance")
		draw_circle(at.call(int(b["x"]), int(b["y"])), (2.2 if ally else 2.0) * r, ALLY if ally else OTHER_BASE)
	for q: Dictionary in _snap.get("hqs", []):
		var p: Vector2 = at.call(int(q["x"]), int(q["y"]))
		draw_rect(Rect2(p - Vector2.ONE * 1.6 * r, Vector2.ONE * 3.2 * r), ALLY if q.get("mine", false) else HQ_OTHER)
	if not mine.is_empty():
		var p: Vector2 = at.call(int(mine["x"]), int(mine["y"]))
		# The player's own base keeps its size whatever the map's.
		var own := w / 132.0 * 0.75
		draw_circle(p, 3.0 * own, PAPER)
		draw_arc(p, 3.0 * own, 0.0, TAU, 16, ALLY, 1.5 * own, true)
	if _view.size() == 4:
		var pts := PackedVector2Array()
		for c: Vector2 in _view:
			pts.append(MinimapMath.tile_to_minimap(size, c.x, c.y, w))
		pts.append(pts[0])
		draw_polyline(pts, PAPER, 1.5 * r, true)

func _gui_input(event: InputEvent) -> void:
	# A touch arrives as an emulated mouse press too (the project default), so only the press is read.
	var press: bool = event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT
	if not press or _snap.is_empty():
		return
	var t := MinimapMath.minimap_to_tile(int(_snap["size"]), event.position, width_px())
	accept_event()
	if t.x >= 0:
		jump.emit(t)
