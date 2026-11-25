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

func test_the_barracks_train_card_holds_the_training_form_and_is_drawn() -> void:
	var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
	panel.open_for("barracks", "train")
	panel.update_model(_model("barracks"), "")
	panel.update_training(_context("en"))
	await wait_process_frames(3)
	assert_true(panel.is_ancestor_of(panel.training))
	assert_gt(panel.get_combined_minimum_size().y, 200.0)

func test_a_sheet_taller_than_its_maximum_scrolls_instead_of_growing() -> void:
	var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
	panel.open_for("barracks", "train")
	panel.update_model(_model("barracks"), "")
	panel.update_training(_context("en"))
	panel.set_max_height(300.0)
	await wait_process_frames(3)
	assert_lte(panel.get_combined_minimum_size().y, 300.0, "the sheet is capped at its maximum, the margins included")

func test_a_shorter_sheet_does_not_keep_the_last_ones_height() -> void:
	var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
	panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	panel.open_for("barracks", "train")
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
	var english := _tile(training, "scouts").title()
	TranslationServer.set_locale("ar")
	training.update_context(_context("ar"))
	assert_eq(_tile(training, "scouts").title(), Loc.t("troop.scouts.name"))
	assert_ne(_tile(training, "scouts").title(), english, "the tiles are translated after a language switch")
	assert_eq(training._submit.text, Loc.t("train.start"))

func test_the_training_tiles_take_the_backgrounds_troop_names() -> void:
	var training: TrainingView = add_child_autofree(TrainingView.new())
	training.update_context(_context("en"))
	assert_eq(_tile(training, "infantry").title(), "Infantry")
	Loc.background_id = "vietnam"
	training.update_context(_context("en"))
	assert_eq(_tile(training, "infantry").title(), "Light infantry")

func test_a_tile_chooses_the_troop_and_the_order_follows() -> void:
	var training: TrainingView = add_child_autofree(TrainingView.new())
	training.update_context(_context("en"))
	assert_true(_tile(training, "infantry").is_selected())
	_tile(training, "porters").pressed.emit()
	training.update_context(_context("en"))
	assert_true(_tile(training, "porters").is_selected())
	assert_false(_tile(training, "infantry").is_selected())
	assert_false(training._cost_chips["materiel"].visible, "porters take no materiel")
	watch_signals(training)
	training._stepper.set_value(5)
	training._on_submit()
	assert_signal_emitted_with_parameters(training, "train_pressed", ["porters", 5])

func test_a_running_batch_hides_the_order_and_the_order_comes_back_after_it() -> void:
	var training: TrainingView = add_child_autofree(TrainingView.new())
	var ctx := _context("en")
	ctx["training"] = {"troop": "heavy", "count": 5, "startedAt": 0, "endsAt": 600000}
	training.update_context(ctx)
	assert_false(training._order.visible)
	assert_true(training._job_card.visible)
	ctx["training"] = null
	training.update_context(ctx)
	assert_true(training._order.visible)
	assert_false(training._job_card.visible)

func test_the_train_card_fits_a_phone_without_scrolling() -> void:
	# Vietnam has the longest troop names (their tiles wrap).
	for background in ["algeria", "vietnam"]:
		for lang in ["en", "ar"]:
			TranslationServer.set_locale(lang)
			Loc.background_id = background
			# A 375x812 phone's card: the width less a small side gap, the height between the top bar and the nav bar.
			var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
			panel.size.x = 1040.0
			panel.open_for("barracks", "train")
			for i in 4:
				panel.update_model(_model("barracks"), background)
				panel.update_training(_context(lang))
				await wait_process_frames(1)
			assert_lt(panel.get_combined_minimum_size().y, 2339.0 - 313.0 - 290.0, "%s %s" % [background, lang])
			assert_lte(panel.get_combined_minimum_size().x, 1040.0, "%s %s" % [background, lang])

func test_the_card_keeps_its_height_when_another_troop_is_chosen() -> void:
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
		panel.size.x = 1040.0
		panel.open_for("barracks", "train")
		var heights: Array = []
		for troop in ["infantry", "porters"]:
			panel.training.choose(troop)
			for i in 4:
				panel.update_model(_model("barracks"), "")
				panel.update_training(_context(lang))
				await wait_process_frames(1)
			heights.append(panel.get_combined_minimum_size().y)
		assert_almost_eq(heights[0], heights[1], 2.0, lang)

func test_lacking_resources_block_the_order_with_the_reason() -> void:
	var training: TrainingView = add_child_autofree(TrainingView.new())
	var ctx := _context("en")
	ctx["amounts"] = {"food": 10.0, "materiel": 1000.0, "funds": 1000.0, "support": 0.0}
	training.update_context(ctx)
	assert_true(training._warning.visible)
	assert_true(training._submit.disabled)
	training.set_notice("training_busy")
	training.update_context(_context("en"))
	assert_true(training._warning.visible, "a refusal shows on an order the form would allow")
	assert_false(training._submit.disabled)

func _tile(training: TrainingView, troop: String) -> TroopTile:
	return training._tiles[troop]

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

func test_the_info_card_shows_what_the_building_does_and_the_upgrade_card_does_not() -> void:
	var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
	panel.open_for("hero_hall", "info")
	panel.update_model(_model("hero_hall"), "")
	var texts := _texts(panel)
	assert_has(texts, Loc.t("heroes.hallNote"))
	assert_has(texts, Loc.t("building.hero_hall.desc"))
	panel.open_for("hero_hall", "upgrade")
	panel.update_model(_model("hero_hall"), "")
	assert_does_not_have(_texts(panel), Loc.t("heroes.hallNote"), "switching the mode rebuilds the card")

func test_the_train_card_is_only_the_training_form() -> void:
	var panel: BuildingPanel = add_child_autofree(BuildingPanel.new())
	panel.open_for("barracks", "train")
	panel.update_model(_model("barracks"), "")
	assert_true(panel.is_ancestor_of(panel.training))
	assert_does_not_have(_texts(panel), Loc.t("panel.upgrade"))

func test_a_centred_card_stays_centred_at_its_height() -> void:
	var holder: Control = add_child_autofree(Control.new())
	holder.size = Vector2(1000, 2000)
	var panel := BuildingPanel.new()
	holder.add_child(panel)
	panel.anchor_left = 0.0
	panel.anchor_right = 1.0
	panel.anchor_top = 0.5
	panel.anchor_bottom = 0.5
	panel.open_for("farm")
	for i in 3:
		panel.update_model(_model("farm"), "")
		await wait_process_frames(1)
	assert_almost_eq(panel.offset_top, -panel.offset_bottom, 0.5)
	assert_almost_eq(panel.position.y + panel.size.y * 0.5, 1000.0, 1.0)

func _texts(panel: BuildingPanel) -> Array:
	return panel.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

