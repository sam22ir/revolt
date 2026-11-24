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

func _rows(screen: ReportsScreen) -> Array:
	return screen.body.get_children().filter(func(c: Node) -> bool: return c is ListRow)

func _texts(root: Node) -> Array:
	return root.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func after_each() -> void:
	TranslationServer.set_locale("en")

func test_the_list_has_one_row_per_report_and_an_empty_list_says_so_and_leads_to_the_map() -> void:
	var screen: ReportsScreen = add_child_autofree(ReportsScreen.new())
	screen.set_reports([])
	assert_eq(_rows(screen).size(), 0)
	assert_has(_texts(screen), Loc.t("report.empty"))
	watch_signals(screen)
	(screen.body.get_child(0) as EmptyState).pressed.emit()
	assert_signal_emitted(screen, "map_requested")
	screen.set_reports([_report("a", 2), _report("b", 1, "defeat")])
	assert_eq(_rows(screen).size(), 2)
	assert_has(_texts(_rows(screen)[1]), Loc.t("march.result.defeat"), "the result is written, not only coloured")

func test_a_report_opens_in_full_and_back_returns_to_the_list_and_then_home() -> void:
	var screen: ReportsScreen = add_child_autofree(ReportsScreen.new())
	screen.set_reports([_report("a", 2), _report("b", 1)])
	watch_signals(screen)
	(_rows(screen)[1] as ListRow).pressed.emit()
	assert_true(screen.is_report_open())
	assert_eq(_rows(screen).size(), 0, "the list rows are gone")
	assert_eq(screen.back_button().tooltip_text, Loc.t("report.back"))
	screen.back_button().pressed.emit()
	assert_false(screen.is_report_open())
	assert_eq(_rows(screen).size(), 2)
	assert_signal_not_emitted(screen, "home_requested")
	screen.back_button().pressed.emit()
	assert_signal_emitted(screen, "home_requested")

func test_an_unknown_id_shows_the_list() -> void:
	var screen: ReportsScreen = add_child_autofree(ReportsScreen.new())
	screen.set_reports([_report("a", 2)])
	screen.open_report("gone")
	assert_false(screen.is_report_open())
	assert_eq(_rows(screen).size(), 1)

func test_a_gone_target_shows_only_its_banner_and_why() -> void:
	var screen: ReportsScreen = add_child_autofree(ReportsScreen.new())
	var r := _report("a", 2, "target_gone")
	r["target"]["kind"] = null
	screen.set_reports([r])
	assert_eq(_rows(screen).size(), 1)
	screen.open_report("a")
	assert_has(_texts(screen), Loc.t("report.targetGone"))
	assert_does_not_have(_texts(screen), Loc.t("report.loot"))

func test_a_real_report_fits_the_width_of_a_phone_in_the_list_and_in_full() -> void:
	var captured: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/captured-march-report.json"))
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		var screen: ReportsScreen = add_child_autofree(ReportsScreen.new())
		screen.set_anchors_preset(Control.PRESET_TOP_LEFT)
		screen.size = Vector2(1080, 1770)
		screen.set_reports(captured["reports"])
		await wait_process_frames(2)
		assert_lte(screen.body.get_combined_minimum_size().x, screen.scroll.size.x, "%s list" % lang)
		screen.open_report(String(captured["reports"][0]["id"]))
		await wait_process_frames(2)
		assert_lte(screen.body.get_combined_minimum_size().x, screen.scroll.size.x, "%s report" % lang)
		assert_has(_texts(screen), Loc.t("hero.mountain_guide.name"))

func test_the_segment_bar_splits_from_the_reading_start() -> void:
	var bar: SegmentBar = add_child_autofree(SegmentBar.new(10.0, [[6, Color.GREEN], [3, Color.ORANGE], [1, Color.RED]]))
	bar.size = Vector2(108, 40)
	var r := bar.rects()
	assert_almost_eq(r[0].position.x, 4.0, 0.01)
	assert_almost_eq(r[0].size.x, 60.0, 0.01)
	assert_almost_eq(r[1].position.x, 64.0, 0.01)
	assert_almost_eq(r[2].end.x, 104.0, 0.01)
	bar.layout_direction = Control.LAYOUT_DIRECTION_RTL
	assert_almost_eq(bar.rects()[0].end.x, 104.0, 0.01, "from the right in Arabic")

func test_the_result_words_read_on_their_badges() -> void:
	for result: String in ReportsScreen.RESULT_COLOURS:
		var back := _luminance(ReportsScreen.RESULT_COLOURS[result])
		assert_gt((_luminance(HudTheme.BUTTON_TEXT) + 0.05) / (back + 0.05), 4.5, result)

func _luminance(c: Color) -> float:
	var l := c.srgb_to_linear()
	return 0.2126 * l.r + 0.7152 * l.g + 0.0722 * l.b

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
