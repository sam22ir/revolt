extends GutTest
## The builders' pill: the help button shows only with a running upgrade the player may ask about, a press asks, and a refusal's
## reason takes the countdown's place for a moment.

func _busy(ends_at: int) -> Dictionary:
	return {"building": "farm", "toLevel": 2, "startedAt": 0, "endsAt": ends_at}

func _help_button(pill: QueuePill) -> Button:
	return pill.find_children("*", "Button", true, false)[0] as Button

## Whether the help button is offered (drawn and pressable).
func _offered(pill: QueuePill) -> bool:
	return _help_button(pill).modulate.a > 0.0 and not _help_button(pill).disabled

func test_the_help_button_shows_only_with_a_running_upgrade_the_player_may_ask_about() -> void:
	var pill: QueuePill = add_child_autofree(QueuePill.new())
	pill.update_model(HudModel.pill(_busy(100_000), 10_000, "base", true), "")
	assert_true(_offered(pill))
	pill.update_model(HudModel.pill(_busy(100_000), 10_000, "base", false), "")
	assert_false(_offered(pill), "not in an alliance, or asked already")
	pill.update_model(HudModel.pill(null, 10_000, "base", true), "")
	assert_false(_offered(pill), "nothing running")

func test_the_help_button_does_not_change_the_pills_height() -> void:
	var pill: QueuePill = add_child_autofree(QueuePill.new())
	pill.update_model(HudModel.pill(_busy(100_000), 10_000, "base", false), "")
	await wait_process_frames(2)
	var without := pill.get_combined_minimum_size().y
	pill.update_model(HudModel.pill(_busy(100_000), 10_000, "base", true), "")
	await wait_process_frames(2)
	assert_eq(pill.get_combined_minimum_size().y, without, "the base is not refitted when the button appears")
	pill.update_model(HudModel.pill(_busy(100_000), 10_000, "base", false), "")
	await wait_process_frames(2)
	assert_eq(pill.get_combined_minimum_size().y, without)

func test_a_press_asks_for_help() -> void:
	var pill: QueuePill = add_child_autofree(QueuePill.new())
	pill.update_model(HudModel.pill(_busy(100_000), 10_000, "base", true), "")
	watch_signals(pill)
	_help_button(pill).pressed.emit()
	assert_signal_emitted(pill, "help_pressed")

func test_a_refusal_takes_the_countdown_place_and_clears_after_its_time() -> void:
	var pill: QueuePill = add_child_autofree(QueuePill.new())
	pill.update_model(HudModel.pill(_busy(100_000), 10_000, "base", true), "")
	pill.show_note("no_job")
	pill.update_model(HudModel.pill(_busy(100_000), 10_000, "base", true), "")
	var time_label := pill.find_children("*", "Label", true, false)[1] as Label
	assert_eq(time_label.text, Loc.t("reason.no_job"))
	pill._note_timer.timeout.emit()
	pill.update_model(HudModel.pill(_busy(100_000), 10_000, "base", true), "")
	assert_ne(time_label.text, Loc.t("reason.no_job"), "the countdown is back")
