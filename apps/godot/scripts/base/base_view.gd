class_name BaseView
extends Node2D
## The base screen's picture: the camp (CampPicture), the chimney smoke (CampLife), and over it each building's name and level, a
## progress bar while it is upgrading, and an outline on the selected one. A tap lands on a building's outline; a tap on empty
## ground deselects. One finger pans, two pinch, the wheel zooms (CampGestures). It lives in its own CanvasLayer (`layer`), which
## `apply_fit` and the gestures move, so the map camera is left alone.

signal building_tapped(id: String)
signal ground_tapped

## Depths: painting, then outlines and bars, then names.
const D_OVERLAY := 100
const D_LABEL := 200
const INK := Color8(0x2b, 0x2a, 0x24)
const GOLD := Color8(0xe0, 0xb0, 0x40)
const OUTLINE := Color8(0xff, 0xf1, 0xb8)
## Text is laid out at twice its world size and drawn at half, so it stays sharp under the layer's zoom. 26 world units come
## out at 12 CSS px or more on a phone (the layer's zoom is at least 360 / 768).
const LABEL_FONT := 52
const LABEL_SCALE := 0.5
## How close a name plate may come to the painting's sides, in world units.
const LABEL_MARGIN := 6.0
const BAR_WIDTH := 120.0
## One notch of the mouse wheel.
const WHEEL_ZOOM := 1.1
const MOUSE := -1

## The CanvasLayer this view is in (set by the owner); `apply_fit` moves it.
var layer: CanvasLayer
var selected := ""
## The player's background, for the buildings' themed names.
var background := ""

var _picture := CampPicture.new()
var _life := CampLife.new()
var _labels := {}
var _overlay := Node2D.new()
var _levels: Dictionary = {}
var _queue: Variant = null
var _now_ms := 0
var _label_key := ""
var _gestures := CampGestures.new()
var _fit: Dictionary = {}
var _offset := Vector2.INF
## How far the player zoomed in, 1 to CampLayout.MAX_ZOOM.
var _zoom_by := 1.0
var _view := Vector2.ZERO
var _top := 0.0
var _nav := 0.0
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

## Loads the camp and makes the names. Called once.
func build() -> void:
	_picture.build()
	add_child(_picture)
	_life.build()
	add_child(_life)
	for id in CampLayout.BUILDINGS:
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
	var plate := HudTheme.tag(18.0, 5.0)
	label.add_theme_stylebox_override("normal", plate)
	return label

## Takes what the screen shows: building levels, the running upgrade (or null) and server time.
func set_state(levels: Dictionary, queue: Variant, now_ms: int) -> void:
	_levels = levels
	_queue = queue
	_now_ms = now_ms
	_picture.set_state(levels, "" if queue == null else String(queue["building"]), now_ms)
	_life.tick(now_ms, CampArt.chimney(look("farm")))
	_refresh_labels()
	_overlay.queue_redraw()

## The look a building shows.
func look(id: String) -> int:
	return CampArt.look_for(int(_levels.get(id, 1)))

func set_selected(id: String) -> void:
	selected = id
	_overlay.queue_redraw()

## The names change only with a level, the language, the background or the zoom; they are re-laid out only then. They keep their
## size on screen when the camp is zoomed in.
func _refresh_labels() -> void:
	var key := "%s|%s|%s|%.3f" % [_levels, TranslationServer.get_locale(), background, _zoom_by]
	if key == _label_key:
		return
	_label_key = key
	var lang := Fmt.lang()
	for id: String in _labels:
		var label: Label = _labels[id]
		label.text = "%s · %s" % [Fmt.amount(lang, int(_levels.get(id, 0))), Loc.t("building.%s.name" % id, {}, background)]
		label.reset_size()
		label.scale = Vector2.ONE * _label_scale()
		var at := CampLayout.label_at(id, look(id))
		var width := label.size.x * _label_scale()
		label.position = Vector2(clampf(at.x - width * 0.5, LABEL_MARGIN, CampLayout.WORLD.x - width - LABEL_MARGIN), at.y)

func _label_scale() -> float:
	return LABEL_SCALE / _zoom_by

## The id of the building at `world` (this node's coordinates), or "" for empty ground. A name plate counts as its building.
func hit_building(world: Vector2) -> String:
	for id: String in _labels:
		var label: Label = _labels[id]
		if Rect2(label.position, label.size * _label_scale()).has_point(world):
			return id
	var looks := {}
	for id in CampLayout.BUILDINGS:
		looks[id] = look(id)
	return CampLayout.building_at(world, looks)

## A point on the building's walls (for tests and tooling).
func building_point(id: String) -> Vector2:
	return CampLayout.point_of(id, look(id))

## Whether the building is shown as upgrading (with scaffolding and a bar).
func is_shaded(id: String) -> bool:
	return _queue != null and _queue["building"] == id

## Fits the layer to a viewport of `view` px, leaving `top` px of HUD above and `nav` px of nav bar below. A later fit keeps
## where the player panned and zoomed to, as far as the new size allows.
func apply_fit(view: Vector2, top: float, nav: float) -> void:
	if layer == null:
		return
	_view = view
	_top = top
	_nav = nav
	_fit = CampLayout.fit(view, top, nav, _zoom_by)
	_move_to(_fit["start"] if _offset == Vector2.INF else _offset)

## Zooms by `factor` about a viewport point, between the covering fit and MAX_ZOOM times it.
func zoom_about(factor: float, about: Vector2) -> void:
	if _fit.is_empty():
		return
	var before := float(_fit["zoom"])
	_zoom_by = clampf(_zoom_by * factor, 1.0, CampLayout.MAX_ZOOM)
	_fit = CampLayout.fit(_view, _top, _nav, _zoom_by)
	_move_to(CampLayout.zoomed(_offset, before, float(_fit["zoom"]), about))
	_refresh_labels()
	_overlay.queue_redraw()

## Where the action ring goes for building `id`, in viewport px: [the middle of its top edge, the middle of its bottom edge
## below its name plate].
func ring_anchors(id: String) -> Array:
	var outline := CampArt.outline(id, look(id))
	var low := outline[0]
	var high := outline[0]
	for p in outline:
		low = low.min(p)
		high = high.max(p)
	var label_at := CampLayout.label_at(id, look(id))
	var x := (low.x + high.x) * 0.5
	var to_screen := func(world: Vector2) -> Vector2: return layer.offset + world * layer.scale if layer != null else world
	return [to_screen.call(Vector2(x, low.y)), to_screen.call(Vector2(x, maxf(high.y, label_at.y + LABEL_FONT * _label_scale() * 1.4)))]

func _move_to(offset: Vector2) -> void:
	_offset = offset.clamp(_fit["low"], _fit["high"])
	layer.scale = Vector2.ONE * float(_fit["zoom"])
	layer.offset = _offset

## A finger that went down on the camp may come up over a button, which takes the event: it is forgotten here either way.
func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and not event.pressed:
		_gestures.forget.call_deferred(event.index)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		_gestures.forget.call_deferred(MOUSE)

## Touches are handled directly, so the mouse events Godot makes from them are left out.
func _unhandled_input(event: InputEvent) -> void:
	if not is_visible_in_tree() or event.device == InputEvent.DEVICE_ID_EMULATION:
		return
	if event is InputEventScreenTouch:
		_on_press(event.index, event.position, event.pressed)
	elif event is InputEventScreenDrag:
		_on_move(event.index, event.position)
	elif event is InputEventMouseMotion:
		_on_move(MOUSE, event.position)
	elif event is InputEventMagnifyGesture:
		zoom_about(event.factor, event.position)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_on_press(MOUSE, event.position, event.pressed)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
		zoom_about(WHEEL_ZOOM, event.position)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
		zoom_about(1.0 / WHEEL_ZOOM, event.position)

func _on_move(index: int, pos: Vector2) -> void:
	var step := _gestures.move(index, pos)
	if _fit.is_empty():
		return
	if step["zoom"] != 1.0:
		zoom_about(step["zoom"], step["about"])
	if step["pan"] != Vector2.ZERO:
		_move_to(_offset + step["pan"])

func _on_press(index: int, pos: Vector2, pressed: bool) -> void:
	if pressed:
		_gestures.press(index, pos)
		return
	if not _gestures.release(index, pos):
		return
	var id := hit_building(get_global_transform_with_canvas().affine_inverse() * pos)
	if id == "":
		ground_tapped.emit()
	else:
		building_tapped.emit(id)

func _draw_overlay() -> void:
	for id in CampLayout.BUILDINGS:
		if is_shaded(id):
			_draw_progress(CampLayout.label_at(id, look(id)))
		if selected == id:
			var closed := CampArt.outline(id, look(id))
			closed.append(closed[0])
			_overlay.draw_polyline(closed, OUTLINE, 3.0 / _zoom_by, true)

## The bar sits just above the building's name.
func _draw_progress(label_at: Vector2) -> void:
	var job: Dictionary = _queue
	var total := maxf(1.0, float(int(job["endsAt"]) - int(job["startedAt"])))
	var frac := clampf((_now_ms - int(job["startedAt"])) / total, 0.0, 1.0)
	var y := label_at.y - 16.0
	_overlay.draw_style_box(_bar_back, Rect2(label_at.x - BAR_WIDTH / 2.0 - 2.0, y - 2.0, BAR_WIDTH + 4.0, 14.0))
	_overlay.draw_style_box(_bar_fill, Rect2(label_at.x - BAR_WIDTH / 2.0, y, maxf(2.0, BAR_WIDTH * frac), 10.0))
