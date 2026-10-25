extends GutTest
## MapCamera's tap: real touch and mouse sequences become a `tapped`; drags, pinches, emulated mouse events and presses a HUD control
## took do not. The events are fed through `_input` and `_unhandled_input` the way the engine calls them.

func _camera() -> MapCamera:
	var cam: MapCamera = add_child_autofree(MapCamera.new())
	return cam

func _touch(index: int, pos: Vector2, pressed: bool) -> InputEventScreenTouch:
	var e := InputEventScreenTouch.new()
	e.index = index
	e.position = pos
	e.pressed = pressed
	return e

func _drag(index: int, pos: Vector2, rel: Vector2) -> InputEventScreenDrag:
	var e := InputEventScreenDrag.new()
	e.index = index
	e.position = pos
	e.relative = rel
	return e

func _mouse(pos: Vector2, pressed: bool, device := 0) -> InputEventMouseButton:
	var e := InputEventMouseButton.new()
	e.button_index = MOUSE_BUTTON_LEFT
	e.position = pos
	e.pressed = pressed
	e.device = device
	return e

## One event the way the engine delivers it: `_input` first, then `_unhandled_input` if no control took it.
func _deliver(cam: MapCamera, e: InputEvent, taken_by_gui := false) -> void:
	cam._input(e)
	if not taken_by_gui:
		cam._unhandled_input(e)

func test_a_touch_tap_emits_once() -> void:
	var cam := _camera()
	watch_signals(cam)
	_deliver(cam, _touch(0, Vector2(300, 400), true))
	_deliver(cam, _touch(0, Vector2(301, 401), false))
	assert_signal_emit_count(cam, "tapped", 1)
	assert_signal_emitted_with_parameters(cam, "tapped", [Vector2(301, 401)])

func test_a_touch_drag_does_not_tap() -> void:
	var cam := _camera()
	watch_signals(cam)
	_deliver(cam, _touch(0, Vector2(300, 400), true))
	_deliver(cam, _drag(0, Vector2(400, 400), Vector2(100, 0)))
	_deliver(cam, _touch(0, Vector2(400, 400), false))
	assert_signal_not_emitted(cam, "tapped")

func test_a_two_finger_sequence_does_not_tap() -> void:
	var cam := _camera()
	watch_signals(cam)
	_deliver(cam, _touch(0, Vector2(300, 400), true))
	_deliver(cam, _touch(1, Vector2(500, 400), true))
	_deliver(cam, _touch(1, Vector2(500, 400), false))
	_deliver(cam, _touch(0, Vector2(300, 400), false))
	assert_signal_not_emitted(cam, "tapped")

func test_a_release_over_a_hud_control_is_not_a_map_tap() -> void:
	var cam := _camera()
	watch_signals(cam)
	_deliver(cam, _touch(0, Vector2(300, 400), true), true)
	_deliver(cam, _touch(0, Vector2(300, 400), false), true)
	assert_signal_not_emitted(cam, "tapped")
	# And a later real tap is not blocked by the stale state.
	_deliver(cam, _touch(0, Vector2(100, 100), true))
	_deliver(cam, _touch(0, Vector2(100, 100), false))
	assert_signal_emit_count(cam, "tapped", 1)

func test_a_mouse_click_taps_and_a_mouse_drag_does_not() -> void:
	var cam := _camera()
	watch_signals(cam)
	_deliver(cam, _mouse(Vector2(50, 60), true))
	_deliver(cam, _mouse(Vector2(50, 60), false))
	assert_signal_emit_count(cam, "tapped", 1)
	_deliver(cam, _mouse(Vector2(50, 60), true))
	var motion := InputEventMouseMotion.new()
	motion.position = Vector2(150, 60)
	motion.relative = Vector2(100, 0)
	_deliver(cam, motion)
	_deliver(cam, _mouse(Vector2(150, 60), false))
	assert_signal_emit_count(cam, "tapped", 1, "a drag is not a tap")

func test_an_emulated_mouse_event_never_taps() -> void:
	var cam := _camera()
	watch_signals(cam)
	_deliver(cam, _mouse(Vector2(50, 60), true, InputEvent.DEVICE_ID_EMULATION))
	_deliver(cam, _mouse(Vector2(50, 60), false, InputEvent.DEVICE_ID_EMULATION))
	assert_signal_not_emitted(cam, "tapped", "one phone tap must not become two")

func test_the_slop_is_in_css_pixels() -> void:
	var cam := _camera()
	assert_almost_eq(cam._slop() * cam.css_per_logical(), MapCamera.TAP_SLOP_CSS, 0.001)

func test_world_at_agrees_with_the_engines_canvas_transform_at_two_zooms() -> void:
	var cam := _camera()
	cam.make_current()
	for z in [0.4, 1.2]:
		cam.view_zoom = z
		cam.focus_world(Vector2(120, 340))
		for p in [Vector2(10, 20), Vector2(500, 700)]:
			var ours := cam.world_at(p)
			var theirs: Vector2 = cam.get_canvas_transform().affine_inverse() * p
			assert_almost_eq(ours.x, theirs.x, 0.5, "x at zoom %s" % z)
			assert_almost_eq(ours.y, theirs.y, 0.5, "y at zoom %s" % z)
