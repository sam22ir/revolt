class_name MapCamera
extends Camera2D
## Pan and zoom for the map. Zoom is expressed like the Phaser client's (tile width in CSS pixels = 96 * view_zoom),
## so the same numbers mean the same framing on a phone. All maths is in CameraMath; this node only reads input.
## Mouse events synthesised from touches are ignored: touches are handled directly (pan with one finger, pinch with
## two), mouse drag and wheel are for desktop.
## Touch press/release is tracked in `_input` (it also sees events over HUD buttons), so a finger lifted over a
## button cannot leave a stale touch behind and turn the next one-finger drag into a pinch.

signal moved
## A tap on the map (a short press that did not become a drag or a pinch, and that no HUD control took): the screen position.
signal tapped(screen_position: Vector2)

## How far a finger may move and still be a tap, in CSS pixels (so it means the same on every phone).
const TAP_SLOP_CSS := 10.0

const MIN_VIEW_ZOOM := 0.12
const MAX_VIEW_ZOOM := 1.6
const START_VIEW_ZOOM := 0.9

var bounds := Rect2()
var view_zoom := START_VIEW_ZOOM

var _touches := {}
var _mouse_down := false
var _tap := TapTracker.new()
var _release_tap := false
var _release_pos := Vector2.ZERO

func _ready() -> void:
	get_viewport().size_changed.connect(_apply)

## CSS pixels per logical (stretched) viewport pixel. On web it comes from the page width; elsewhere from the
## window size and the screen scale (density).
func css_per_logical() -> float:
	var logical_w := get_viewport_rect().size.x
	if OS.has_feature("web"):
		var w: Variant = JavaScriptBridge.eval("window.innerWidth")
		if (w is float or w is int) and float(w) > 0.0:
			return float(w) / logical_w
	var density := maxf(DisplayServer.screen_get_scale(), 1.0)
	var ratio := float(DisplayServer.window_get_size().x) / density / logical_w
	# A headless run has no window (width 0): fall back to 1 CSS pixel per logical pixel.
	return ratio if ratio > 0.0 else 1.0

## Camera zoom in logical (stretched) pixels per world unit: a tile `96 * view_zoom` CSS pixels wide is
## `96 * view_zoom / css_per_logical` logical pixels wide.
func _logical_zoom() -> float:
	return view_zoom / maxf(css_per_logical(), 0.0001)

func focus_world(world: Vector2) -> void:
	position = world
	_apply()

func _apply() -> void:
	view_zoom = CameraMath.clamp_zoom(view_zoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM)
	var z := _logical_zoom()
	zoom = Vector2(z, z)
	if bounds.size != Vector2.ZERO:
		position = CameraMath.clamp_center(position, get_viewport_rect().size, z, bounds)
	moved.emit()

func _zoom_about(factor: float, anchor_screen: Vector2) -> void:
	var viewport_px := get_viewport_rect().size
	var old_zoom := _logical_zoom()
	view_zoom = CameraMath.clamp_zoom(view_zoom * factor, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM)
	position = CameraMath.zoom_about(position, viewport_px, old_zoom, _logical_zoom(), anchor_screen)
	_apply()

func _pan_by(screen_delta: Vector2) -> void:
	position = CameraMath.pan(position, screen_delta, _logical_zoom())
	_apply()

## The slop in logical pixels.
func _slop() -> float:
	return TAP_SLOP_CSS / maxf(css_per_logical(), 0.0001)

## The world point under a screen position.
func world_at(screen: Vector2) -> Vector2:
	return CameraMath.screen_to_world(screen, position, get_viewport_rect().size, _logical_zoom())

func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed:
			_release_tap = false
			_touches[event.index] = event.position
			_tap.press(event.index, event.position, Time.get_ticks_msec(), _touches.size(), _slop())
		else:
			_release_tap = _tap.release(event.index, event.position, Time.get_ticks_msec())
			_release_pos = event.position
			_touches.erase(event.index)
	elif event is InputEventScreenDrag:
		_tap.move(event.index, event.position)
	elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_release_tap = false
			_tap.press(-2, event.position, Time.get_ticks_msec(), 1, _slop())
		else:
			_mouse_down = false
			_release_tap = _tap.release(-2, event.position, Time.get_ticks_msec())
			_release_pos = event.position
	elif event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION:
		_tap.move(-2, event.position)

func _unhandled_input(event: InputEvent) -> void:
	# `_input` decided whether the release ends a tap; it counts only when no HUD control took the event (this is `_unhandled_input`).
	var released: bool = (event is InputEventScreenTouch and not event.pressed) or (event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed)
	if released and _release_tap:
		_release_tap = false
		tapped.emit(_release_pos)
	if event is InputEventScreenDrag:
		_on_screen_drag(event)
	elif event is InputEventMouseButton:
		if event.device == InputEvent.DEVICE_ID_EMULATION:
			return
		if event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			_mouse_down = true
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom_about(1.1, event.position)
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom_about(1.0 / 1.1, event.position)
	elif event is InputEventMouseMotion:
		if event.device != InputEvent.DEVICE_ID_EMULATION and _mouse_down:
			_pan_by(event.relative)
	elif event is InputEventMagnifyGesture:
		_zoom_about(event.factor, event.position)

func _on_screen_drag(event: InputEventScreenDrag) -> void:
	if _touches.size() == 1:
		_touches[event.index] = event.position
		_pan_by(event.relative)
	elif _touches.size() >= 2 and _touches.has(event.index):
		var ids := _touches.keys()
		var before_a: Vector2 = _touches[ids[0]]
		var before_b: Vector2 = _touches[ids[1]]
		_touches[event.index] = event.position
		var css := maxf(css_per_logical(), 0.0001)
		var step := CameraMath.pinch_step(position, get_viewport_rect().size, _logical_zoom(), MIN_VIEW_ZOOM / css, MAX_VIEW_ZOOM / css, before_a, before_b, _touches[ids[0]], _touches[ids[1]])
		position = step["center"]
		view_zoom = float(step["zoom"]) * css
		_apply()
