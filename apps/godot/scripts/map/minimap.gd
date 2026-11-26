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
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(HudTheme.px(WIDTH), HudTheme.px(WIDTH) / 2.0)
	tooltip_text = ""

func width_px() -> float:
	return custom_minimum_size.x

## New map data: rebakes the regions only when the map or the liberated set changed.
func set_snapshot(snap: Dictionary, now_ms: int) -> void:
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
		_bake(seed, size, held)
	queue_redraw()

## Where the camera looks, as the four corners of the free band in tile coordinates.
func set_view(corners: Array) -> void:
	_view = corners
	queue_redraw()

func _bake(seed: int, size: int, liberated: Array) -> void:
	var cell := int(Balance.data()["map"]["regionCell"])
	_regions.resize(size * size)
	for y in size:
		for x in size:
			_regions[y * size + x] = MapMath.region_at(seed, x, y, size, cell)
	var w := int(width_px())
	var h := w / 2
	var image := Image.create_empty(w, h, false, Image.FORMAT_RGBA8)
	var ids := PackedInt32Array()
	ids.resize(w * h)
	ids.fill(-1)
	for py in h:
		for px in w:
			var t := MinimapMath.minimap_to_tile(size, Vector2(px + 0.5, py + 0.5), w)
			if t.x >= 0:
				ids[py * w + px] = _regions[t.y * size + t.x]
	for py in h:
		for px in w:
			var id := ids[py * w + px]
			if id < 0:
				continue
			var c := LIBERATED if liberated.has(id) else HELD
			var right := ids[py * w + px + 1] if px + 1 < w else id
			var down := ids[(py + 1) * w + px] if py + 1 < h else id
			if (right >= 0 and right != id) or (down >= 0 and down != id):
				c = PAPER if liberated.has(id) or liberated.has(right) or liberated.has(down) else BORDER
				c.a = 0.8
			image.set_pixel(px, py, c)
	_texture = ImageTexture.create_from_image(image)

func _draw() -> void:
	if _texture == null or _snap.is_empty():
		return
	var w := width_px()
	draw_texture_rect(_texture, Rect2(Vector2.ZERO, Vector2(w, w / 2.0)), false)
	var rim := PackedVector2Array([Vector2(w / 2.0, 0.0), Vector2(w, w / 4.0), Vector2(w / 2.0, w / 2.0), Vector2(0.0, w / 4.0), Vector2(w / 2.0, 0.0)])
	draw_polyline(rim, Color(0.15, 0.1, 0.07, 0.95), HudTheme.px(2.5), true)
	draw_polyline(rim, HudTheme.BRASS, HudTheme.px(1.0), true)
	var size := int(_snap["size"])
	var at := func(x: int, y: int) -> Vector2: return MinimapMath.tile_to_minimap(size, x + 0.5, y + 0.5, w)
	var r := w / 132.0 * 0.75
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
		draw_circle(p, 3.0 * r, PAPER)
		draw_arc(p, 3.0 * r, 0.0, TAU, 16, ALLY, 1.5 * r, true)
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
