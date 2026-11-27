extends GutTest
## Villages and lessons on the client: VillageModel against the rules' behaviour, the tile sheet's village view and Help action, the aid
## sheet, the academy's study list, and the lessons applied to the client's own numbers (storage, support, training, healing).

class FakeApi:
	extends RefCounted
	var token := "t"
	var posted: Array = []
	var replies: Array = []
	func get_json(_path: String) -> Dictionary:
		await (Engine.get_main_loop() as SceneTree).process_frame
		return {"ok": false, "status": 0, "data": null}
	func post_json(_path: String, body: Variant = {}) -> Dictionary:
		posted.append(body)
		await (Engine.get_main_loop() as SceneTree).process_frame
		return replies.pop_front() if not replies.is_empty() else {"ok": false, "status": 0, "data": null}

const DAY := 86400000.0
const V := {"id": "village:3", "kind": "healers", "x": 20, "y": 22, "need": "food", "day": 100}

func _state(extra := {}) -> Dictionary:
	var s := {"resources": {"food": 5000, "materiel": 5000, "funds": 5000, "support": 0}, "levels": {"infirmary": 1, "academy": 1, "hq": 3},
		"troops": {"infantry": 30, "scouts": 0, "heavy": 0, "porters": 10}, "marches": [], "villages": {}, "lessonsTaught": [], "lessons": []}
	s.merge(extra, true)
	return s

func after_each() -> void:
	Balance.lessons = []
	TranslationServer.set_locale("en")

func _texts(root: Node) -> Array:
	return root.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func test_trust_fades_by_the_day_and_never_grows_backwards() -> void:
	var s := _state({"villages": {"village:3": {"trust": 100.0, "at": 0.0, "taught": 1, "helpedDay": 99}}})
	var decay := float(Balance.data()["villages"]["trustDecayPerDay"])
	assert_almost_eq(VillageModel.trust(s, "village:3", DAY), 100.0 - decay, 0.0001)
	assert_eq(VillageModel.trust(s, "village:3", -5.0 * DAY), 100.0)
	assert_eq(VillageModel.trust(s, "village:3", 400.0 * DAY), 0.0)
	assert_eq(VillageModel.trust(s, "nowhere", 0.0), 0.0)
	var levels: Array = Balance.data()["villages"]["trustLevels"]
	assert_eq([VillageModel.level_of(0.0), VillageModel.level_of(float(levels[0])), VillageModel.level_of(float(levels[2]))], [0, 1, 3])

func test_the_next_lesson_and_the_day_s_help() -> void:
	var s := _state({"villages": {"village:3": {"trust": 70.0, "at": 0.0, "taught": 1, "helpedDay": 100}}})
	assert_true(VillageModel.helped_today(s, V))
	assert_eq(VillageModel.next_lesson(s, V), {"level": 2, "lesson": "bone_setting"})
	assert_eq(VillageModel.next_lesson(_state({"villages": {"village:3": {"trust": 300.0, "at": 0.0, "taught": 3, "helpedDay": 1}}}), V), {})
	assert_eq(VillageModel.helped_ids({"villages": [V]}, s), {"village:3": true})

func test_aid_checks_follow_the_rules() -> void:
	var s := _state()
	var amounts: Dictionary = s["resources"]
	assert_eq(VillageModel.check(s, V, {"infantry": 5, "porters": 10}, amounts, 0.0), "")
	assert_eq(VillageModel.check(s, V, {"infantry": 5}, amounts, 0.0), "not_enough_carry")
	assert_eq(VillageModel.check(s, V, {}, amounts, 0.0), "no_troops")
	var protect := V.duplicate()
	protect["need"] = "protection"
	assert_eq(VillageModel.check(s, protect, {"infantry": 5}, amounts, 0.0), "not_this_need")
	var care := V.duplicate()
	care["need"] = "care"
	assert_eq(VillageModel.check(s, care, {"infantry": 5}, amounts, 0.0), "infirmary_level")
	var labor := V.duplicate()
	labor["need"] = "labor"
	assert_eq(VillageModel.check(s, labor, {"infantry": 5}, amounts, 0.0), "labor_troops")
	var going := _state({"marches": [{"aid": {"village": "village:3", "day": 100}}]})
	assert_eq(VillageModel.check(going, V, {"infantry": 5, "porters": 10}, amounts, 0.0), "already_on_the_way")
	assert_eq(VillageModel.check(s, V, {"infantry": 5, "porters": 10}, {"food": 1}, 0.0), "insufficient")
	assert_gt(int(VillageModel.plan("food", 2)["cost"]["food"]), int(VillageModel.plan("food", 0)["cost"]["food"]))

func test_the_tile_sheet_shows_a_village_and_offers_help_unless_answered() -> void:
	var snap := {"bases": [], "hqs": [], "npcs": [], "villages": [V]}
	var info := TileModel.info(snap, 20, 22, "plain")
	assert_eq(info["kind"], "village")
	var view := TileModel.view(info, 20, 22, "", [], 0.0, _state())
	assert_eq(view["title"], Loc.t("village.healers.name"))
	assert_true(view["can_aid"])
	assert_has(view["lines"], Loc.t("village.trustNone"))
	var helped := TileModel.view(info, 20, 22, "", [], 0.0, _state({"villages": {"village:3": {"trust": 30.0, "at": 0.0, "taught": 0, "helpedDay": 100}}}))
	assert_false(helped["can_aid"])
	assert_has(helped["lines"], Loc.t("village.helpedToday"))
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	panel.show_tile(Vector2i(20, 22))
	panel.update_view(snap, "plain", "", "", 0.0, [], _state())
	watch_signals(panel)
	var help: Button = null
	for b: Button in panel.find_children("*", "Button", true, false):
		if b.text == Loc.t("village.help"):
			help = b
	assert_not_null(help)
	help.pressed.emit()
	assert_signal_emitted(panel, "aid_requested")

func test_the_aid_sheet_sends_the_aid_intent() -> void:
	var api := FakeApi.new()
	var session := Session.new(api, Clock.new())
	session.apply({"state": _state(), "now": 5})
	var sheet: MarchSheet = add_child_autofree(MarchSheet.new())
	sheet.setup(session)
	sheet.open(V, Vector2i(10, 10), "aid")
	assert_has(_texts(sheet), Loc.t("village.healers.name"))
	sheet.call("_set_count", "infantry", 5)
	sheet.call("_set_count", "porters", 10)
	api.replies = [{"ok": true, "status": 200, "data": {"ok": true, "state": _state(), "now": 6}}]
	sheet.call("_on_send")
	await wait_process_frames(4)
	assert_eq(api.posted.size(), 1)
	assert_eq(api.posted[0]["type"], "aid")
	assert_eq(api.posted[0]["village"], "village:3")

func test_the_academy_lists_taught_lessons_and_sends_a_study() -> void:
	var view: StudyView = add_child_autofree(StudyView.new())
	var ctx := {"academy": 1, "taught": [], "studied": [], "study": null, "amounts": {"food": 9000.0, "materiel": 9000.0, "funds": 9000.0, "support": 0.0}, "now_ms": 0, "lang": "en"}
	view.update_context(ctx)
	assert_has(_texts(view), Loc.t("study.none"))
	ctx["taught"] = ["hidden_paths", "night_marches"]
	ctx["studied"] = ["hidden_paths"]
	view.update_context(ctx)
	var texts := _texts(view)
	assert_has(texts, Loc.t("lesson.night_marches.name"))
	assert_has(texts, Loc.t("study.studied"))
	assert_has(texts, Loc.t("reason.academy_level", {"level": "3"}), "a level-2 lesson needs academy 3")
	ctx["academy"] = 3
	view.update_context(ctx)
	watch_signals(view)
	for b: Button in view.find_children("*", "Button", true, false):
		if b.text == Loc.t("study.button"):
			assert_false(b.disabled)
			b.pressed.emit()
	assert_signal_emitted_with_parameters(view, "study_pressed", ["night_marches"])
	assert_eq(ActionRing.actions_for("academy"), ["upgrade", "info", "study"])

func test_studied_lessons_change_the_client_s_numbers_like_the_server_s() -> void:
	var cap := Balance.storage_cap(3)
	var support := float(Balance.production_per_hour({"hq": 3}, 1.0)["support"])
	var batch := TrainingModel.max_batch(2)
	var train: Dictionary = TrainingModel.quote("infantry", 10)
	var heal := HealModel.quote({"infantry": 10})
	Balance.lessons = ["grain_sacks", "woven_stores", "safe_houses", "repair_work", "metal_craft", "master_smith", "herbal_remedies", "convalescence", "bone_setting"]
	assert_eq(int(Balance.storage_cap(3)["food"]), floori(float(cap["food"]) * 1.2))
	assert_almost_eq(float(Balance.production_per_hour({"hq": 3}, 1.0)["support"]), support * 1.15, 0.001)
	assert_gt(TrainingModel.max_batch(2), batch)
	assert_lt(float(TrainingModel.quote("infantry", 10)["cost"]["food"]), float(train["cost"]["food"]))
	assert_lt(float(TrainingModel.quote("infantry", 10)["duration_ms"]), float(train["duration_ms"]))
	assert_lt(int(HealModel.quote({"infantry": 10})["cost"]["food"]), int(heal["cost"]["food"]))
	assert_gt(HealModel.max_batch(2), 2 * int(Balance.data()["healing"]["batchPerLevel"]))
	Balance.lessons = []
	assert_eq(Balance.storage_cap(3), cap, "nothing changes without lessons")

func test_the_session_takes_the_lessons_from_the_base() -> void:
	var s := Session.new(FakeApi.new(), Clock.new())
	s.apply({"state": _state({"lessons": ["grain_sacks"]}), "now": 5})
	assert_eq(Balance.lessons, ["grain_sacks"])
	s.apply({"state": _state(), "now": 6})
	assert_eq(Balance.lessons, [])

func test_the_new_texts_exist_in_english_and_arabic() -> void:
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		for key in ["village.shepherds.name", "village.help", "need.labor.line", "lesson.high_passes.name", "study.title", "aid.send", "building.academy.name", "reason.not_enough_carry", "reason.study_busy"]:
			assert_ne(Loc.t(key), key, "%s in %s" % [key, lang])
