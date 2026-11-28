extends GutTest
## The base arrow on the map: tapping it goes home, like the My base button.

var tools: MapTools

func before_each() -> void:
	tools = MapTools.new()
	add_child_autofree(tools)
	tools.place(150.0, false)

func test_no_arrow_no_button() -> void:
	assert_false(tools.arrow_button.visible)

func test_base_off_screen_shows_a_tappable_arrow() -> void:
	var band := Rect2(0, 200, 1080, 1500)
	tools.set_arrow(Vector2(-2000, 900), band, 20)
	assert_true(tools.arrow_button.visible)
	# The area sits on the left edge, where the arrow points, and is finger-sized.
	assert_lt(tools.arrow_button.position.x, 200.0)
	assert_gt(tools.arrow_button.size.x, HudTheme.px(40.0))
	assert_gt(tools.arrow_button.size.y, HudTheme.px(40.0))

func test_tapping_the_arrow_asks_to_go_home() -> void:
	tools.set_arrow(Vector2(-2000, 900), Rect2(0, 200, 1080, 1500), 20)
	watch_signals(tools)
	tools.arrow_button.pressed.emit()
	assert_signal_emitted(tools, "home_pressed")

func test_base_back_in_view_hides_it() -> void:
	var band := Rect2(0, 200, 1080, 1500)
	tools.set_arrow(Vector2(-2000, 900), band, 20)
	tools.set_arrow(Vector2(500, 900), band, 0)
	assert_false(tools.arrow_button.visible)
	tools.set_arrow(Vector2(-2000, 900), band, 20)
	tools.clear_arrow()
	assert_false(tools.arrow_button.visible)
