extends GutTest
## The resource sheet: its model (store, time to full, rate and its sources) and the sheet (texts, buttons, closing), and the top bar's
## trays that open it.

const LEVELS := {"hq": 3, "farm": 4, "armory": 1, "treasury": 1, "barracks": 1, "hero_hall": 1, "watchtower": 1, "infirmary": 1, "academy": 1}

func before_each() -> void:
	TranslationServer.set_locale("en")
	Balance.lessons = []

func after_each() -> void:
	Balance.lessons = []

func _row(building: String, level: int) -> Dictionary:
	return Balance.level_row(Balance.data()["buildings"][building]["levels"], level)

func test_producers() -> void:
	assert_eq(ResourceSheetModel.producer("food"), "farm")
	assert_eq(ResourceSheetModel.producer("materiel"), "armory")
	assert_eq(ResourceSheetModel.producer("funds"), "treasury")
	assert_eq(ResourceSheetModel.producer("support"), "hq")

func test_the_model_has_the_store_the_rate_and_the_time_to_full() -> void:
	var cap := float(Balance.storage_cap(3)["food"])
	var m := ResourceSheetModel.build("food", {"food": cap - 1000.0}, LEVELS, [], 0)
	var rate := float(_row("farm", 4)["ratePerHour"])
	assert_eq(m["cap"], cap)
	assert_eq(m["rate"], rate)
	assert_eq(m["base_rate"], rate)
	assert_eq(m["producer"], "farm")
	assert_eq(m["producer_level"], 4)
	assert_eq(m["storage_level"], 3)
	assert_false(m["full"])
	assert_eq(m["full_in_ms"], ceili(1000.0 / rate * 3600000.0))
	assert_eq(m["liberation_pct"], 0)

func test_a_full_store_has_no_time_and_amounts_over_the_cap_stay() -> void:
	var cap := float(Balance.storage_cap(3)["funds"])
	var m := ResourceSheetModel.build("funds", {"funds": cap + 50.0}, LEVELS, [], 0)
	assert_true(m["full"])
	assert_eq(m["full_in_ms"], -1)
	assert_eq(m["fraction"], 1.0)
	assert_eq(m["amount"], cap + 50.0)

func test_liberated_regions_and_lessons_show_their_share() -> void:
	var libs := [{"region": 1, "from": 0, "until": null}, {"region": 2, "from": 0, "until": null}]
	var m := ResourceSheetModel.build("food", {"food": 0.0}, LEVELS, libs, 10)
	var per := float(Balance.data()["liberation"]["bonusPerRegion"])
	assert_eq(m["liberation_pct"], roundi(2.0 * per * 100.0))
	assert_almost_eq(float(m["rate"]), float(m["base_rate"]) * (1.0 + 2.0 * per), 0.001)
	var lesson := ""
	for id: String in Balance.data()["lessons"]:
		if Balance.data()["lessons"][id]["stat"] == "support_rate":
			lesson = id
	if lesson != "":
		Balance.lessons = [lesson]
		var s := ResourceSheetModel.build("support", {"support": 0.0}, LEVELS, [], 10)
		assert_gt(int(s["lesson_pct"]), 0)
		assert_eq(ResourceSheetModel.build("food", {"food": 0.0}, LEVELS, [], 10)["lesson_pct"], 0, "the support lesson only touches support")

func _texts(root: Node) -> Array:
	return root.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func test_the_sheet_shows_the_resource_and_goes_to_its_building() -> void:
	var sheet: ResourceSheet = add_child_autofree(ResourceSheet.new())
	var cap := float(Balance.storage_cap(3)["food"])
	sheet.open("food", ResourceSheetModel.build("food", {"food": 500.0}, LEVELS, [], 0))
	var texts := _texts(sheet)
	assert_has(texts, Loc.t("resource.food"))
	assert_has(texts, Loc.t("resourceSheet.perHour"))
	assert_has(texts, Loc.t("resourceSheet.stored", {"amount": "500", "cap": Fmt.amount("en", cap)}))
	assert_has(texts, Loc.t("resourceSheet.source", {"building": Loc.t("building.farm.name"), "level": "4"}))
	assert_eq(sheet.go_button.text, Loc.t("resourceSheet.goTo", {"building": Loc.t("building.farm.name")}))
	assert_false(sheet.room_button.visible, "plenty of room")
	watch_signals(sheet)
	sheet.go_button.pressed.emit()
	assert_signal_emitted_with_parameters(sheet, "building_requested", ["farm"])

func test_a_nearly_full_store_offers_more_room_at_the_command_post() -> void:
	var sheet: ResourceSheet = add_child_autofree(ResourceSheet.new())
	var cap := float(Balance.storage_cap(3)["materiel"])
	sheet.open("materiel", ResourceSheetModel.build("materiel", {"materiel": cap}, LEVELS, [], 0))
	assert_true(sheet.room_button.visible)
	assert_has(_texts(sheet), Loc.t("resourceSheet.full", {"building": Loc.t("building.hq.name")}))
	watch_signals(sheet)
	sheet.room_button.pressed.emit()
	assert_signal_emitted_with_parameters(sheet, "building_requested", ["hq"])
	# Support is the command post's own: no second button to the same place.
	sheet.open("support", ResourceSheetModel.build("support", {"support": 99999.0}, LEVELS, [], 0))
	assert_false(sheet.room_button.visible)

func test_every_text_follows_the_language() -> void:
	var sheet: ResourceSheet = add_child_autofree(ResourceSheet.new())
	TranslationServer.set_locale("ar")
	sheet.open("food", ResourceSheetModel.build("food", {"food": 0.0}, LEVELS, [], 0))
	var texts := _texts(sheet)
	assert_has(texts, Loc.t("resourceSheet.perHour"))
	assert_does_not_have(texts, "Per hour")
	TranslationServer.set_locale("en")

func test_a_tap_outside_closes_it() -> void:
	var sheet: ResourceSheet = add_child_autofree(ResourceSheet.new())
	sheet.open("funds", ResourceSheetModel.build("funds", {"funds": 0.0}, LEVELS, [], 0))
	watch_signals(sheet)
	var up := InputEventMouseButton.new()
	up.button_index = MOUSE_BUTTON_LEFT
	up.pressed = false
	sheet._gui_input(up)
	assert_false(sheet.visible)
	assert_signal_emitted(sheet, "closed")

func test_arabic_texts_exist() -> void:
	TranslationServer.set_locale("ar")
	for key: String in ["resourceSheet.stored", "resourceSheet.fullIn", "resourceSheet.full", "resourceSheet.noProduction", "resourceSheet.perHour", "resourceSheet.source", "resourceSheet.liberation", "resourceSheet.lessons", "resourceSheet.total", "resourceSheet.storage", "resourceSheet.goTo", "resourceSheet.moreRoom", "resourceSheet.use.food", "resourceSheet.use.materiel", "resourceSheet.use.funds", "resourceSheet.use.support"]:
		assert_ne(Loc.t(key), key, key)
	TranslationServer.set_locale("en")

func test_the_top_bar_trays_announce_a_tap() -> void:
	var top: HudTop = add_child_autofree(HudTop.new())
	watch_signals(top)
	(top.cells["funds"] as ResourceCell).pressed.emit()
	assert_signal_emitted_with_parameters(top, "resource_pressed", ["funds"])
