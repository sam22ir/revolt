extends GutTest
## ReportsScreen and ReportToast: one row per report, a report opens in full and back returns to the list, an unknown id shows
## the list, and tapping the toast opens the report it was shown for.

func _report(id: String, at: float, result := "victory") -> Dictionary:
	var none := {"infantry": 0, "scouts": 0, "heavy": 0, "porters": 0}
	return {
		"id": id, "at": at, "result": result, "rounds": 1,
		"target": {"kind": "patrol", "level": 2, "x": 5, "y": 6},
		"sent": {"infantry": 4, "scouts": 0, "heavy": 0, "porters": 0}, "survivors": none, "wounded": none, "lost": none,
		"defenders": {"infantry": 2, "scouts": 0, "heavy": 0, "porters": 0}, "defendersKilled": none,
		"loot": {"food": 20, "materiel": 0, "funds": 0, "support": 0}, "seed": null,
	}

func _buttons(root: Node, text := "") -> Array:
	return root.find_children("*", "Button", true, false).filter(func(b: Button) -> bool: return text == "" or b.text == text)

func test_the_list_has_one_row_per_report_and_an_empty_list_says_so() -> void:
	var screen: ReportsScreen = add_child_autofree(ReportsScreen.new())
	screen.set_reports([])
	assert_eq(_buttons(screen).size(), 0)
	screen.set_reports([_report("a", 2), _report("b", 1, "defeat")])
	assert_eq(_buttons(screen).size(), 2)

func test_a_report_opens_in_full_and_back_returns_to_the_list() -> void:
	var screen: ReportsScreen = add_child_autofree(ReportsScreen.new())
	screen.set_reports([_report("a", 2), _report("b", 1)])
	screen.open_report("b")
	assert_eq(_buttons(screen, Loc.t("report.back")).size(), 1, "the detail has a back button")
	assert_eq(_buttons(screen).size(), 1, "the detail shows its one button (back) and the list rows are gone")
	screen.open_report("")
	assert_eq(_buttons(screen, Loc.t("report.back")).size(), 0)
	assert_eq(_buttons(screen).size(), 2)

func test_an_unknown_id_shows_the_list() -> void:
	var screen: ReportsScreen = add_child_autofree(ReportsScreen.new())
	screen.set_reports([_report("a", 2)])
	screen.open_report("gone")
	assert_eq(_buttons(screen, Loc.t("report.back")).size(), 0)
	assert_eq(_buttons(screen).size(), 1)

func test_the_toast_shows_the_report_and_tapping_it_opens_that_report() -> void:
	var toast: ReportToast = add_child_autofree(ReportToast.new())
	assert_false(toast.visible)
	toast.show_report(_report("a", 1, "defeat"))
	assert_true(toast.visible)
	assert_eq(toast.text, "%s · %s" % [Loc.t("report.newReport"), Loc.t("march.result.defeat")])
	watch_signals(toast)
	toast.pressed.emit()
	assert_signal_emitted_with_parameters(toast, "opened", ["a"])
	assert_false(toast.visible)
