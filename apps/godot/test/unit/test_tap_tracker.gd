extends GutTest
## TapTracker: a tap is one pointer, short, that barely moved; a drag, a pinch, a long press and a stray release are not.

func test_a_short_press_that_barely_moves_is_a_tap() -> void:
	var t := TapTracker.new()
	t.press(0, Vector2(100, 100), 0, 1, 10.0)
	t.move(0, Vector2(103, 102))
	assert_true(t.release(0, Vector2(103, 102), 120))

func test_a_drag_past_the_slop_is_not_a_tap_even_if_it_ends_where_it_began() -> void:
	var t := TapTracker.new()
	t.press(0, Vector2(100, 100), 0, 1, 10.0)
	t.move(0, Vector2(140, 100))
	assert_false(t.release(0, Vector2(100, 100), 120))

func test_a_long_press_is_not_a_tap() -> void:
	var t := TapTracker.new()
	t.press(0, Vector2.ZERO, 0, 1, 10.0)
	assert_false(t.release(0, Vector2.ZERO, TapTracker.MAX_MS + 1))

func test_a_second_finger_cancels_and_the_release_after_a_pinch_is_not_a_tap() -> void:
	var t := TapTracker.new()
	t.press(0, Vector2(100, 100), 0, 1, 10.0)
	t.press(1, Vector2(200, 100), 10, 2, 10.0)
	assert_false(t.release(1, Vector2(200, 100), 50))
	assert_false(t.release(0, Vector2(100, 100), 60), "the first finger's release after a pinch")

func test_a_release_without_a_press_or_of_another_pointer_is_not_a_tap() -> void:
	var t := TapTracker.new()
	assert_false(t.release(0, Vector2.ZERO, 10))
	t.press(0, Vector2.ZERO, 0, 1, 10.0)
	assert_false(t.release(5, Vector2.ZERO, 10))
