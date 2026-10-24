class_name BaseView
extends Node2D
## The base screen's picture (scene/base-scene.ts): the ground slab and the six buildings on their plots, drawn back to front,
## with a level badge on each plot's front corner, a progress bar and a dimmed sprite while a building is upgrading, and an
## outline on the selected one. A tap lands on the painted pixels (alpha at least 40), the nearest building first; a tap on
## empty ground deselects. It lives in its own CanvasLayer (`layer`), and `apply_fit` fits that layer to the screen between
## the HUD above and the nav bar below, so the map camera is left alone.

signal building_tapped(id: String)
signal ground_tapped

## Depths: ground, then buildings back to front, then outlines, then badges and bars.
const D_SPRITE := 10
const D_OUTLINE := 100
const D_HUD := 200
## Pixels at least this opaque count as part of a building when tapped.
const ALPHA_TAP := 40.0 / 255.0
const UPGRADING_TINT := Color8(0xb8, 0xaa, 0x94)
const INK := Color8(0x2b, 0x2a, 0x24)
const GOLD := Color8(0xe0, 0xb0, 0x40)
const OUTLINE := Color8(0xff, 0xf1, 0xb8)
const BADGE_RADIUS := 23.0
const BADGE_FONT := 30
const BAR_WIDTH := 70.0
## A press and release closer than this (viewport px) is a tap.
const TAP_SLOP := 16.0

## The CanvasLayer this view is in (set by the owner); `apply_fit` moves it.
var layer: CanvasLayer
var selected := ""

var _ground := Sprite2D.new()
var _sprites := {}
var _images := {}
var _placements := {}
var _infos := {}
var _order: Array[String] = []
var _overlay := Node2D.new()
var _levels: Dictionary = {}
var _queue: Variant = null
var _now_ms := 0
var _press := Vector2.INF
var _bar_back := StyleBoxFlat.new()
var _bar_fill := StyleBoxFlat.new()

func _ready() -> void:
	_bar_back.bg_color = Color(INK, 0.85)
	_bar_back.set_corner_radius_all(6)
	_bar_fill.bg_color = GOLD
	_bar_fill.set_corner_radius_all(4)
	_overlay.z_index = D_OUTLINE
	_overlay.draw.connect(_draw_overlay)
	add_child(_overlay)

## Loads the sprites and puts them on their plots. Called once.
func build() -> void:
	var manifest := BaseLayout.manifest()
	var g_info: Dictionary = manifest[BaseLayout.GROUND_KEY]
	var g := BaseLayout.place_ground(g_info)
	_ground.texture = _load(BaseLayout.GROUND_KEY)
	_ground.centered = false
	_ground.position = Vector2(g["x"], g["y"])
	_ground.scale = Vector2(g["sx"], g["sy"])
	_ground.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	add_child(_ground)
	var ids: Array[String] = []
	for id: String in Balance.data()["buildingIds"]:
		ids.append(id)
		var key := BaseLayout.sprite_key(id)
		var info: Dictionary = manifest[key]
		var p := BaseLayout.place_sprite(BaseLayout.plot(id), info)
		var tex := _load(key)
		var sprite := Sprite2D.new()
		sprite.texture = tex
		sprite.centered = false
		sprite.position = Vector2(p["x"], p["y"])
		sprite.scale = Vector2(p["scale"], p["scale"])
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		add_child(sprite)
		_sprites[id] = sprite
		_images[id] = tex.get_image()
		_placements[id] = p
		_infos[id] = info
	# Back to front by the plot's centre line, so nearer buildings overlap farther ones.
	ids.sort_custom(func(a: String, b: String) -> bool: return float(BaseLayout.plot_center(BaseLayout.plot(a))["y"]) < float(BaseLayout.plot_center(BaseLayout.plot(b))["y"]))
	_order = ids
	for i in _order.size():
		_sprites[_order[i]].z_index = D_SPRITE + i

func _load(key: String) -> Texture2D:
	return load(BaseLayout.SPRITE_DIR + key + ".webp")

## Takes what the screen shows: building levels, the running upgrade (or null) and server time.
func set_state(levels: Dictionary, queue: Variant, now_ms: int) -> void:
	_levels = levels
	_queue = queue
	_now_ms = now_ms
	for id: String in _sprites:
		var upgrading: bool = queue != null and queue["building"] == id
		_sprites[id].modulate = UPGRADING_TINT if upgrading else Color.WHITE
	_overlay.queue_redraw()

func set_selected(id: String) -> void:
	selected = id
	_overlay.queue_redraw()

## The id of the building whose painted pixels lie at `world` (this node's coordinates), or "" for empty ground. The nearest
## building (drawn last) wins where sprites overlap.
func hit_building(world: Vector2) -> String:
	for i in range(_order.size() - 1, -1, -1):
		var id := _order[i]
		var sprite: Sprite2D = _sprites[id]
		var px := (world - sprite.position) / sprite.scale.x
		var image: Image = _images[id]
		if px.x < 0.0 or px.y < 0.0 or px.x >= image.get_width() or px.y >= image.get_height():
			continue
		if image.get_pixel(int(px.x), int(px.y)).a >= ALPHA_TAP:
			return id
	return ""

## A point on the building's walls, above the plot centre where its own sprite is opaque (for tests and tooling).
func building_point(id: String) -> Vector2:
	var c := BaseLayout.plot_center(BaseLayout.plot(id))
	return Vector2(c["x"], float(c["y"]) - float(_placements[id]["height"]) * 0.35)

## Sprite widths and positions, for the camera fit.
func span() -> float:
	var sprites := []
	for id: String in _sprites:
		sprites.append({"x": _placements[id]["x"], "width": float(_infos[id]["w"]) * float(_placements[id]["scale"])})
	return BaseLayout.span(sprites)

## Fits the layer to a viewport of `view` px, leaving `top` px of HUD above and `nav` px of nav bar below.
func apply_fit(view: Vector2, top: float, nav: float) -> void:
	if layer == null or _sprites.is_empty():
		return
	var f := BaseLayout.fit(view.x, view.y, 1.0, top, nav, span())
	var z := float(f["zoom"])
	layer.scale = Vector2(z, z)
	layer.offset = view / 2.0 - Vector2(f["cx"], f["cy"]) * z

func _unhandled_input(event: InputEvent) -> void:
	if not is_visible_in_tree() or not event is InputEventMouseButton or event.button_index != MOUSE_BUTTON_LEFT:
		return
	if event.pressed:
		_press = event.position
		return
	if _press == Vector2.INF or event.position.distance_to(_press) > TAP_SLOP:
		_press = Vector2.INF
		return
	_press = Vector2.INF
	var id := hit_building(get_global_transform_with_canvas().affine_inverse() * event.position)
	if id == "":
		ground_tapped.emit()
	else:
		building_tapped.emit(id)

func _draw_overlay() -> void:
	for id: String in _order:
		var plot := BaseLayout.plot(id)
		var corners := BaseLayout.footprint(plot)
		if selected == id:
			var closed := corners.duplicate()
			closed.append(corners[0])
			_overlay.draw_polyline(closed, OUTLINE, 5.0)
		# Level badge on the plot's front corner, clear of the walls.
		var at := corners[2] + Vector2(0, 2)
		_overlay.draw_circle(at, BADGE_RADIUS, Color(INK, 0.9))
		_overlay.draw_arc(at, BADGE_RADIUS, 0.0, TAU, 32, OUTLINE, 3.0)
		var text := str(int(_levels.get(id, 0)))
		var font := ThemeDB.fallback_font
		var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, BADGE_FONT).x
		_overlay.draw_string(font, at + Vector2(-w * 0.5, BADGE_FONT * 0.36), text, HORIZONTAL_ALIGNMENT_LEFT, -1, BADGE_FONT, Color8(0xff, 0xf8, 0xe6))
		if _queue != null and _queue["building"] == id:
			_draw_progress(plot)

func _draw_progress(plot: Dictionary) -> void:
	var job: Dictionary = _queue
	var total := maxf(1.0, float(int(job["endsAt"]) - int(job["startedAt"])))
	var frac := clampf((_now_ms - int(job["startedAt"])) / total, 0.0, 1.0)
	var c := BaseLayout.plot_center(plot)
	var y := float(c["y"]) - 6.0
	_overlay.draw_style_box(_bar_back, Rect2(float(c["x"]) - BAR_WIDTH / 2.0 - 3.0, y - 3.0, BAR_WIDTH + 6.0, 14.0))
	_overlay.draw_style_box(_bar_fill, Rect2(float(c["x"]) - BAR_WIDTH / 2.0, y, maxf(4.0, BAR_WIDTH * frac), 8.0))
