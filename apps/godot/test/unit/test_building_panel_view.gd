extends GutTest
## The building sheet's height and the training form. A sheet on another building once collapsed to its margins, and the training
## texts stayed in the language they were built in.

func after_each() -> void:
	TranslationServer.set_locale("en")
	Loc.background_id = ""

func _levels() -> Dictionary:
	return {"hq": 2, "farm": 2, "armory": 1, "treasury": 1, "barracks": 2, "hero_hall": 1}

func _rich() -> Dictionary:
	return {"food": 1000.0, "materiel": 1000.0, "funds": 1000.0, "support": 1000.0}

func _model(id: String) -> Dictionary:
	return BuildingPanelModel.build(id, _levels(), _rich(), null, 0)

func _context(lang: String) -> Dictionary:
	return {"barracks": 2, "troops": {"infantry": 4, "scouts": 0, "heavy": 0, "porters": 0},
		"wounded": {"infantry": 0, "scouts": 0, "heavy": 0, "porters": 0}, "training": null, "amounts": _rich(), "now_ms": 0, "lang": lang}

func test_a_farm_sheet_has_its_content_and_no_training_form() -> void:
	var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
	panel.open_for("farm")
	panel.update_model(_model("farm"), "")
	await wait_process_frames(3)
	assert_gt(panel.get_combined_minimum_size().y, 200.0, "the sheet is drawn, not collapsed to its margins")
	assert_false(panel.is_ancestor_of(panel.training))

func test_the_barracks_sheet_holds_the_training_form_and_is_drawn() -> void:
	var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
	panel.open_for("barracks")
	panel.update_model(_model("barracks"), "")
	panel.update_training(_context("en"))
	await wait_process_frames(3)
	assert_true(panel.is_ancestor_of(panel.training))
	assert_gt(panel.get_combined_minimum_size().y, 200.0)

func test_a_sheet_taller_than_its_maximum_scrolls_instead_of_growing() -> void:
	var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
	panel.open_for("barracks")
	panel.update_model(_model("barracks"), "")
	panel.update_training(_context("en"))
	panel.set_max_height(300.0)
	await wait_process_frames(3)
	assert_lte(panel.get_combined_minimum_size().y, 300.0, "the sheet is capped at its maximum, the margins included")

func test_a_shorter_sheet_does_not_keep_the_last_ones_height() -> void:
	var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
	panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	panel.open_for("barracks")
	for i in 3:
		panel.update_model(_model("barracks"), "")
		panel.update_training(_context("en"))
		await wait_process_frames(1)
	var tall := panel.size.y
	panel.open_for("hq")
	for i in 3:
		panel.update_model(_model("hq"), "")
		await wait_process_frames(1)
	assert_lt(panel.size.y, tall, "the sheet shrank to its content")
	assert_eq(panel.size.y, panel.get_combined_minimum_size().y)

func test_the_training_form_follows_the_language() -> void:
	var training: TrainingView = add_child_autofree(TrainingView.new())
	TranslationServer.set_locale("en")
	training.update_context(_context("en"))
	var english: String = training._title.text
	TranslationServer.set_locale("ar")
	training.update_context(_context("ar"))
	assert_eq(training._title.text, Loc.t("train.title"))
	assert_ne(training._title.text, english, "the title is translated after a language switch")

func test_the_training_help_button_shows_with_a_running_batch_the_player_may_ask_about() -> void:
	var training: TrainingView = add_child_autofree(TrainingView.new())
	var ctx := _context("en")
	ctx["training"] = {"troop": "infantry", "count": 5, "startedAt": 0, "endsAt": 600000}
	ctx["now_ms"] = 1000
	ctx["can_help"] = true
	training.update_context(ctx)
	assert_true(training._help_button.visible)
	ctx["can_help"] = false
	training.update_context(ctx)
	assert_false(training._help_button.visible)
	ctx["training"] = null
	ctx["can_help"] = true
	training.update_context(ctx)
	assert_false(training._help_button.visible, "no batch, no button")

func _upgrading_model(id: String) -> Dictionary:
	var queue := {"building": id, "toLevel": 2, "startedAt": 0, "endsAt": 600_000}
	return BuildingPanelModel.build(id, _levels(), _rich(), queue, 100_000)

func _speedup_view(reason := "") -> Dictionary:
	return {"visible": true, "reason": reason, "tokens": 3, "left_ms": 3_600_000.0}

func test_the_upgrading_sheet_holds_the_speed_up_row_and_keeps_it_across_a_rebuild() -> void:
	var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
	panel.open_for("armory")
	panel.update_model(_upgrading_model("armory"), "")
	panel.update_speedup(_speedup_view())
	await wait_process_frames(2)
	assert_true(panel.is_ancestor_of(panel.upgrade_speedup))
	assert_true(panel.upgrade_speedup.visible)
	# A language change rebuilds the sheet: the same row is still in it, and still alive.
	TranslationServer.set_locale("ar")
	panel.update_model(_upgrading_model("armory"), "")
	panel.update_speedup(_speedup_view())
	await wait_process_frames(2)
	assert_true(is_instance_valid(panel.upgrade_speedup))
	assert_true(panel.is_ancestor_of(panel.upgrade_speedup), "the row survived the rebuild")
	assert_eq(panel.upgrade_speedup.button().text, Loc.t("live.store.useOn.upgrade"))

func test_a_sheet_that_is_not_upgrading_has_no_speed_up_row() -> void:
	var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
	panel.open_for("farm")
	panel.update_model(_model("farm"), "")
	panel.update_speedup(_speedup_view())
	await wait_process_frames(2)
	assert_false(panel.is_ancestor_of(panel.upgrade_speedup))
	assert_true(is_instance_valid(panel.upgrade_speedup))

func test_leaving_the_tree_does_not_free_the_kept_children() -> void:
	var panel := BuildingPanel.new()
	add_child(panel)
	panel.open_for("farm")
	panel.update_model(_model("farm"), "")
	remove_child(panel)
	assert_true(is_instance_valid(panel.training))
	assert_true(is_instance_valid(panel.upgrade_speedup))
	panel.free()

func test_the_hero_hall_sheet_links_to_the_heroes_screen() -> void:
	var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
	watch_signals(panel)
	panel.open_for("hero_hall")
	panel.update_model(_model("hero_hall"), "")
	await wait_process_frames(2)
	var link: Array = panel.find_children("*", "Button", true, false).filter(func(b: Button) -> bool: return b.text == Loc.t("heroes.open"))
	assert_eq(link.size(), 1)
	link[0].pressed.emit()
	assert_signal_emitted(panel, "heroes_requested")
