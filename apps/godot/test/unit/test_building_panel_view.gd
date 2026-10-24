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
	assert_lte(panel.get_combined_minimum_size().y, 300.0 + 80.0, "the sheet is capped near its maximum, the margins included")

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
