extends GutTest
## SpeedupRow: hidden without a view, the wallet line and the button's text per job, why it is off, one press at a time.

func _view(reason := "") -> Dictionary:
	return {"visible": true, "reason": reason, "tokens": 3, "left_ms": 3_600_000.0}

func test_it_is_hidden_until_it_has_a_visible_view() -> void:
	var row: SpeedupRow = add_child_autofree(SpeedupRow.new())
	row.update_view({"visible": false, "reason": "", "tokens": 0, "left_ms": 0.0})
	assert_false(row.visible)
	row.update_view(_view())
	assert_true(row.visible)

func test_the_button_says_which_job_and_is_on_when_nothing_blocks_it() -> void:
	var row: SpeedupRow = add_child_autofree(SpeedupRow.new())
	row.update_view(_view())
	assert_eq(row.button().text, Loc.t("live.store.useOn.upgrade"))
	assert_false(row.button().disabled)
	row.kind = "training"
	row.update_view(_view())
	assert_eq(row.button().text, Loc.t("live.store.useOn.training"))

func test_a_reason_turns_it_off_and_is_shown() -> void:
	var row: SpeedupRow = add_child_autofree(SpeedupRow.new())
	row.update_view(_view("hq_job"))
	assert_true(row.button().disabled)
	assert_eq(row.reason_text(), Loc.t("reason.hq_job"))

func test_a_press_emits_once_and_the_pending_state_holds_it() -> void:
	var row: SpeedupRow = add_child_autofree(SpeedupRow.new())
	watch_signals(row)
	row.update_view(_view())
	row.button().pressed.emit()
	assert_signal_emit_count(row, "pressed", 1)
	row.set_pending(true)
	assert_true(row.button().disabled)
	row.button().pressed.emit()
	assert_signal_emit_count(row, "pressed", 1, "no second press while one is out")
	row.set_pending(false)
	assert_false(row.button().disabled)

func test_a_blocked_press_does_nothing() -> void:
	var row: SpeedupRow = add_child_autofree(SpeedupRow.new())
	watch_signals(row)
	row.update_view(_view("daily_cap"))
	row.button().pressed.emit()
	assert_signal_not_emitted(row, "pressed")

func test_a_refusal_note_shows_under_the_button() -> void:
	var row: SpeedupRow = add_child_autofree(SpeedupRow.new())
	row.update_view(_view())
	row.show_note("no_speedup_job")
	row.update_view(_view())
	assert_eq(row.reason_text(), Loc.t("reason.no_speedup_job"))
