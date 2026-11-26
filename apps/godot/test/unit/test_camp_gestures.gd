extends GutTest
## Fingers on the camp: one pans past the slop, two pinch, a short press is a tap; and zooming keeps the point under the fingers,
## stays within its limits and never shows past the picture.

const VIEW := Vector2(1080, 2340)
const TOP := 300.0
const NAV := 252.0

func test_a_short_press_is_a_tap_and_a_drag_is_not() -> void:
	var g := CampGestures.new()
	g.press(0, Vector2(100, 100))
	assert_eq(g.move(0, Vector2(108, 100))["pan"], Vector2.ZERO, "inside the slop")
	assert_true(g.release(0, Vector2(108, 100)))
	g.press(0, Vector2(100, 100))
	assert_eq(g.move(0, Vector2(100, 160))["pan"], Vector2(0, 60))
	assert_false(g.release(0, Vector2(100, 100)), "even back where it started")

func test_two_fingers_zoom_about_their_middle_and_are_never_a_tap() -> void:
	var g := CampGestures.new()
	g.press(0, Vector2(0, 0))
	g.press(1, Vector2(100, 0))
	var step := g.move(1, Vector2(200, 0))
	assert_almost_eq(float(step["zoom"]), 2.0, 0.001)
	assert_eq(step["about"], Vector2(100, 0))
	assert_eq(step["pan"], Vector2(50, 0))
	assert_false(g.release(1, Vector2(200, 0)))
	assert_false(g.release(0, Vector2(0, 0)))

func test_fingers_on_one_spot_do_not_divide_by_nothing() -> void:
	var g := CampGestures.new()
	g.press(0, Vector2(50, 50))
	g.press(1, Vector2(50, 50))
	assert_eq(g.move(1, Vector2(90, 50))["zoom"], 1.0)

func test_a_release_that_went_elsewhere_leaves_no_finger_behind() -> void:
	var g := CampGestures.new()
	g.press(0, Vector2(50, 50))
	g.forget(0)
	g.press(0, Vector2(300, 300))
	assert_true(g.release(0, Vector2(300, 300)), "the next press is a fresh tap")
	assert_false(g.release(7, Vector2.ZERO), "an unknown finger")

func _view() -> BaseView:
	var layer := CanvasLayer.new()
	add_child_autofree(layer)
	var view := BaseView.new()
	view.layer = layer
	layer.add_child(view)
	view.build()
	view.apply_fit(VIEW, TOP, NAV)
	return view

func test_zooming_keeps_the_point_under_the_fingers() -> void:
	var view := _view()
	var about := Vector2(540, 1200)
	var before := (about - view.layer.offset) / view.layer.scale
	view.zoom_about(1.6, about)
	assert_almost_eq((about - view.layer.offset) / view.layer.scale, before, Vector2.ONE * 0.5)

func test_zoom_stays_between_the_fit_and_its_limit_and_covers_the_screen() -> void:
	var view := _view()
	var fit := view.layer.scale.x
	view.zoom_about(100.0, Vector2(10, 310))
	assert_almost_eq(view.layer.scale.x, fit * CampLayout.MAX_ZOOM, 0.001)
	view.zoom_about(0.001, Vector2(1000, 2000))
	assert_almost_eq(view.layer.scale.x, fit, 0.001)
	for about: Vector2 in [Vector2(0, TOP), VIEW, Vector2(540, 900)]:
		view.zoom_about(1.7, about)
		view.zoom_about(0.8, VIEW - about)
		var size := CampLayout.WORLD * view.layer.scale
		assert_lte(view.layer.offset.x, 0.01)
		assert_gte(view.layer.offset.x + size.x, VIEW.x - 0.01)
		assert_lte(view.layer.offset.y, TOP + 0.01)
		assert_gte(view.layer.offset.y + size.y, VIEW.y - NAV - 0.01)

func test_a_refit_keeps_the_zoom() -> void:
	var view := _view()
	view.zoom_about(1.5, Vector2(540, 1200))
	var scale := view.layer.scale.x
	view.apply_fit(VIEW, TOP, NAV)
	assert_almost_eq(view.layer.scale.x, scale, 0.001)

func test_touches_pinch_and_the_mouse_events_made_from_them_are_left_out() -> void:
	var view := _view()
	var fit := view.layer.scale.x
	for i in 2:
		var down := InputEventScreenTouch.new()
		down.index = i
		down.position = Vector2(400 + i * 200, 1200)
		down.pressed = true
		view._unhandled_input(down)
	var drag := InputEventScreenDrag.new()
	drag.index = 1
	drag.position = Vector2(700, 1200)
	view._unhandled_input(drag)
	assert_almost_eq(view.layer.scale.x, fit * 1.5, 0.001)
	var fake := InputEventMouseButton.new()
	fake.device = InputEvent.DEVICE_ID_EMULATION
	fake.button_index = MOUSE_BUTTON_WHEEL_UP
	fake.pressed = true
	view._unhandled_input(fake)
	assert_almost_eq(view.layer.scale.x, fit * 1.5, 0.001)
