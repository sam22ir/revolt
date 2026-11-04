class_name BaseView
extends Node2D
## The base screen's picture: one painting of the whole camp with every building in it (CampLayout). Over it go each building's
## name and level, a progress bar and a shade while it is upgrading, and an outline on the selected one. A tap lands on a
## building's traced outline; a tap on empty ground deselects. A drag pans the painting where it is bigger than the space between
## the HUD and the nav bar. It lives in its own CanvasLayer (`layer`), and `apply_fit` fits that layer to the screen, so the map
## camera is left alone.

signal building_tapped(id: String)
signal ground_tapped

## Depths: painting, then outlines and bars, then names.
const D_OVERLAY := 100
const D_LABEL := 200
const INK := Color8(0x2b, 0x2a, 0x24)
const GOLD := Color8(0xe0, 0xb0, 0x40)
const OUTLINE := Color8(0xff, 0xf1, 0xb8)
const UPGRADING_SHADE := Color(0.17, 0.12, 0.07, 0.3)
## Text is laid out at twice its world size and drawn at half, so it stays sharp under the layer's zoom. 26 world units come
## out at 12 CSS px or more on a phone (the layer's zoom is at least 360 / 768).
const LABEL_FONT := 52
const LABEL_SCALE := 0.5
## How close a name plate may come to the painting's sides, in world units.
const LABEL_MARGIN := 6.0
const BAR_WIDTH := 70.0
## A press and release closer than this (viewport px) is a tap.
const TAP_SLOP := 16.0

## The CanvasLayer this view is in (set by the owner); `apply_fit` moves it.
var layer: CanvasLayer
var selected := ""
## The player's background, for the buildings' themed names.
var background := ""

var _painting := Sprite2D.new()
var _labels := {}
var _overlay := Node2D.new()
var _levels: Dictionary = {}
var _queue: Variant = null
var _now_ms := 0
var _label_key := ""
var _press := Vector2.INF
var _dragged := false
var _fit: Dictionary = {}
var _offset := Vector2.INF
var _bar_back := StyleBoxFlat.new()
var _bar_fill := StyleBoxFlat.new()

func _ready() -> void:
	_bar_back.bg_color = Color(INK, 0.85)
	_bar_back.set_corner_radius_all(3)
	_bar_fill.bg_color = GOLD
	_bar_fill.set_corner_radius_all(2)
	_overlay.z_index = D_OVERLAY
	_overlay.draw.connect(_draw_overlay)
	add_child(_overlay)

## Loads the painting and makes the names. Called once.
func build() -> void:
	var tex: Texture2D = load(CampLayout.PAINTING)
	_painting.texture = tex
	_painting.centered = false
	_painting.scale = CampLayout.WORLD / tex.get_size()
	_painting.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	add_child(_painting)
	for id: String in CampLayout.REGIONS:
		_labels[id] = _make_label()
		add_child(_labels[id])

func _make_label() -> Label:
	var label := Label.new()
	label.z_index = D_LABEL
	label.scale = Vector2.ONE * LABEL_SCALE
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", LABEL_FONT)
	label.add_theme_color_override("font_color", HudTheme.TEXT)
	var plate := StyleBoxFlat.new()
	plate.bg_color = Color(HudTheme.PANEL, 0.9)
	plate.border_color = HudTheme.BRASS
	plate.set_border_width_all(3)
	plate.set_corner_radius_all(18)
	plate.content_margin_left = 18.0
	plate.content_margin_right = 18.0
	plate.content_margin_top = 4.0
	plate.content_margin_bottom = 4.0
	label.add_theme_stylebox_override("normal", plate)
	return label

## Takes what the screen shows: building levels, the running upgrade (or null) and server time.
func set_state(levels: Dictionary, queue: Variant, now_ms: int) -> void:
	_levels = levels
	_queue = queue
	_now_ms = now_ms
	_refresh_labels()
	_overlay.queue_redraw()

func set_selected(id: String) -> void:
	selected = id
	_overlay.queue_redraw()

## The names change only with a level, the language or the background; they are re-laid out only then.
func _refresh_labels() -> void:
	var key := "%s|%s|%s" % [_levels, TranslationServer.get_locale(), background]
	if key == _label_key:
		return
	_label_key = key
	var lang := Fmt.lang()
	for id: String in _labels:
		var label: Label = _labels[id]
		label.text = "%s · %s" % [Fmt.amount(lang, int(_levels.get(id, 0))), Loc.t("building.%s.name" % id, {}, background)]
		label.reset_size()
		var at: Vector2 = CampLayout.REGIONS[id]["label"]
		var width := label.size.x * LABEL_SCALE
		label.position = Vector2(clampf(at.x - width * 0.5, LABEL_MARGIN, CampLayout.WORLD.x - width - LABEL_MARGIN), at.y)

## The id of the building at `world` (this node's coordinates), or "" for empty ground. A name plate counts as its building.
func hit_building(world: Vector2) -> String:
	for id: String in _labels:
		var label: Label = _labels[id]
		if Rect2(label.position, label.size * LABEL_SCALE).has_point(world):
			return id
	return CampLayout.building_at(world)

## A point on the building's walls (for tests and tooling).
func building_point(id: String) -> Vector2:
	return CampLayout.REGIONS[id]["point"]

## Whether the building is shown as upgrading.
func is_shaded(id: String) -> bool:
	return _queue != null and _queue["building"] == id

## Fits the layer to a viewport of `view` px, leaving `top` px of HUD above and `nav` px of nav bar below. A later fit keeps
## where the player panned to, as far as the new size allows.
func apply_fit(view: Vector2, top: float, nav: float) -> void:
	if layer == null:
		return
	_fit = CampLayout.fit(view, top, nav)
	var z := float(_fit["zoom"])
	layer.scale = Vector2(z, z)
	_move_to(_fit["start"] if _offset == Vector2.INF else _offset)

func _move_to(offset: Vector2) -> void:
	_offset = offset.clamp(_fit["low"], _fit["high"])
	layer.offset = _offset

func _unhandled_input(event: InputEvent) -> void:
	if not is_visible_in_tree():
		return
	if event is InputEventMouseMotion:
		_on_motion(event)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_on_button(event)

func _on_motion(event: InputEventMouseMotion) -> void:
	if _press == Vector2.INF or _fit.is_empty():
		return
	_dragged = _dragged or event.position.distance_to(_press) > TAP_SLOP
	if _dragged:
		_move_to(_offset + event.relative)

func _on_button(event: InputEventMouseButton) -> void:
	if event.pressed:
		_press = event.position
		_dragged = false
		return
	var is_tap := _press != Vector2.INF and not _dragged and event.position.distance_to(_press) <= TAP_SLOP
	_press = Vector2.INF
	if not is_tap:
		return
	var id := hit_building(get_global_transform_with_canvas().affine_inverse() * event.position)
	if id == "":
		ground_tapped.emit()
	else:
		building_tapped.emit(id)

func _draw_overlay() -> void:
	for id: String in CampLayout.REGIONS:
		var shape := CampLayout.outline(id)
		if is_shaded(id):
			_overlay.draw_colored_polygon(shape, UPGRADING_SHADE)
			_draw_progress(CampLayout.REGIONS[id]["label"])
		if selected == id:
			var closed := shape.duplicate()
			closed.append(shape[0])
			_overlay.draw_polyline(closed, OUTLINE, 3.0, true)

## The bar sits just above the building's name.
func _draw_progress(label_at: Vector2) -> void:
	var job: Dictionary = _queue
	var total := maxf(1.0, float(int(job["endsAt"]) - int(job["startedAt"])))
	var frac := clampf((_now_ms - int(job["startedAt"])) / total, 0.0, 1.0)
	var y := label_at.y - 10.0
	_overlay.draw_style_box(_bar_back, Rect2(label_at.x - BAR_WIDTH / 2.0 - 2.0, y - 2.0, BAR_WIDTH + 4.0, 9.0))
	_overlay.draw_style_box(_bar_fill, Rect2(label_at.x - BAR_WIDTH / 2.0, y, maxf(2.0, BAR_WIDTH * frac), 5.0))
