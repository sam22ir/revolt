extends GutTest

const VIEW := Vector2(400, 800)
const BOUNDS := Rect2(0, 0, 2000, 1000)

func test_clamp_keeps_view_inside_bounds() -> void:
	# Zoom 1: half the view is (200, 400), so the centre ranges over x in [200, 1800] and y in [400, 600].
	assert_eq(CameraMath.clamp_center(Vector2(-500, -500), VIEW, 1.0, BOUNDS), Vector2(200, 400))
	assert_eq(CameraMath.clamp_center(Vector2(5000, 5000), VIEW, 1.0, BOUNDS), Vector2(1800, 600))

func test_clamp_centres_when_view_is_larger_than_bounds() -> void:
	# Zoomed far out the view covers the whole map: centre on the map.
	assert_eq(CameraMath.clamp_center(Vector2(10, 10), VIEW, 0.1, BOUNDS), Vector2(1000, 500))

func test_clamp_leaves_a_valid_center_alone() -> void:
	assert_eq(CameraMath.clamp_center(Vector2(900, 500), VIEW, 1.0, BOUNDS), Vector2(900, 500))

func test_zoom_is_clamped() -> void:
	assert_eq(CameraMath.clamp_zoom(0.01, 0.4, 3.0), 0.4)
	assert_eq(CameraMath.clamp_zoom(9.0, 0.4, 3.0), 3.0)
	assert_eq(CameraMath.clamp_zoom(1.5, 0.4, 3.0), 1.5)

func test_zoom_about_keeps_the_anchor_point_fixed() -> void:
	var center := Vector2(700, 300)
	var anchor := Vector2(100, 650)
	var before := CameraMath.screen_to_world(anchor, center, VIEW, 1.0)
	var new_center := CameraMath.zoom_about(center, VIEW, 1.0, 2.5, anchor)
	var after := CameraMath.screen_to_world(anchor, new_center, VIEW, 2.5)
	assert_almost_eq(after.x, before.x, 1e-3)
	assert_almost_eq(after.y, before.y, 1e-3)

func test_zoom_about_the_screen_centre_does_not_move_the_camera() -> void:
	var center := Vector2(700, 300)
	assert_eq(CameraMath.zoom_about(center, VIEW, 1.0, 3.0, VIEW * 0.5), center)

func test_pan_follows_the_finger() -> void:
	# Dragging right by 100 px at zoom 2 moves the camera left by 50 world units.
	assert_eq(CameraMath.pan(Vector2(500, 500), Vector2(100, 0), 2.0), Vector2(450, 500))

func test_pinch_scale_and_midpoints() -> void:
	var g := CameraMath.pinch(Vector2(100, 100), Vector2(200, 100), Vector2(50, 100), Vector2(250, 100))
	assert_almost_eq(g["scale"], 2.0, 1e-6)
	assert_eq(g["from"], Vector2(150, 100))
	assert_eq(g["to"], Vector2(150, 100))

func test_pinch_with_both_fingers_on_one_point_does_not_blow_up() -> void:
	var g := CameraMath.pinch(Vector2(100, 100), Vector2(100, 100), Vector2(80, 100), Vector2(120, 100))
	assert_eq(g["scale"], 1.0)
