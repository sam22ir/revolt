extends GutTest
## The count control: kept between 1 and the maximum, typing counts at once.

func test_the_value_is_kept_between_one_and_the_maximum() -> void:
	var s: Stepper = add_child_autofree(Stepper.new())
	s.set_maximum(20)
	s.set_value(99)
	assert_eq(s.value, 20)
	s.set_value(-3)
	assert_eq(s.value, 1)
	s.set_value(15)
	s.set_maximum(10)
	assert_eq(s.value, 10, "a lower maximum lowers the value")
	assert_eq(s._input.text, "10")

func test_the_buttons_step_and_stop_at_the_ends() -> void:
	var s: Stepper = add_child_autofree(Stepper.new())
	s.set_maximum(3)
	assert_true(s._minus.disabled)
	s._plus.pressed.emit()
	assert_eq(s.value, 2)
	assert_false(s._minus.disabled)
	s._max_button.pressed.emit()
	assert_eq(s.value, 3)
	assert_true(s._plus.disabled)
	assert_true(s._max_button.disabled)

func test_typing_counts_at_once_and_signals() -> void:
	var s: Stepper = add_child_autofree(Stepper.new())
	s.set_maximum(20)
	watch_signals(s)
	s._input.text_changed.emit("7")
	assert_eq(s.value, 7)
	assert_signal_emitted_with_parameters(s, "changed", [7])
	s._input.text_changed.emit("")
	assert_eq(s.value, 7, "an emptied field keeps the last count")
