extends GutTest
## The infirmary and the watchtower on the client: HealModel against the real rules (data/heal-fixtures.json), the heal form, the
## ring's Heal button, the forecast's lines and request, the Session's scout call, and the march sheet's forecast card (an answer
## for an old choice is dropped).

class FakeApi:
	extends RefCounted
	var token := "t"
	var paths: Array[String] = []
	var posted: Array = []
	var replies: Array = []
	func get_json(path: String) -> Dictionary:
		paths.append(path)
		await (Engine.get_main_loop() as SceneTree).process_frame
		return {"ok": false, "status": 0, "data": null}
	func post_json(path: String, body: Variant = {}) -> Dictionary:
		paths.append(path)
		posted.append(body)
		await (Engine.get_main_loop() as SceneTree).process_frame
		return replies.pop_front() if not replies.is_empty() else {"ok": false, "status": 0, "data": null}

func _texts(root: Node) -> Array:
	return root.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func after_each() -> void:
	TranslationServer.set_locale("en")

func test_heal_model_matches_the_rules() -> void:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/heal-fixtures.json")), OK)
	for c: Dictionary in parsed.data["cases"]:
		var healing: Variant = {"troops": {"infantry": 1}, "startedAt": 0, "endsAt": 1} if c["busy"] else null
		var plan := HealModel.plan(int(c["infirmary"]), c["wounded"], c["resources"])
		var want: Dictionary = c["expected"]
		for id: String in want["plan"]:
			assert_eq(int(plan[id]), int(want["plan"][id]), "%s: plan %s" % [c["name"], id])
		var q := HealModel.quote(want["plan"])
		assert_eq(int(q["durationMs"]), int(want["quote"]["durationMs"]), "%s: time" % c["name"])
		for id: String in want["quote"]["cost"]:
			assert_eq(int(q["cost"][id]), int(want["quote"]["cost"][id]), "%s: cost %s" % [c["name"], id])
		var reason: Variant = want["reason"]
		assert_eq(HealModel.check(int(c["infirmary"]), c["wounded"], c["resources"], healing), "" if reason == null else String(reason), "%s: reason" % c["name"])

func _ctx(wounded: Dictionary, healing: Variant = null, amounts := {"food": 5000.0, "materiel": 5000.0, "funds": 5000.0, "support": 0.0}) -> Dictionary:
	return {"infirmary": 1, "wounded": wounded, "healing": healing, "amounts": amounts, "now_ms": 1000, "lang": "en"}

func _heal_button(root: Node) -> Button:
	for b: Button in root.find_children("*", "Button", true, false):
		if b.text == Loc.t("heal.button"):
			return b
	return null

func test_the_heal_form_shows_the_wounded_the_next_group_and_sends_the_press() -> void:
	var view: HealView = add_child_autofree(HealView.new())
	view.update_context(_ctx({"infantry": 0, "scouts": 0, "heavy": 0, "porters": 0}))
	assert_has(_texts(view), Loc.t("heal.none"))
	assert_null(_heal_button(view))
	view.update_context(_ctx({"infantry": 20, "scouts": 0, "heavy": 0, "porters": 0}))
	assert_has(_texts(view), Loc.t("heal.wounded", {"count": "20"}))
	assert_has(_texts(view), Loc.t("heal.next", {"count": str(HealModel.max_batch(1))}))
	var b := _heal_button(view)
	assert_false(b.disabled)
	watch_signals(view)
	b.pressed.emit()
	assert_signal_emitted(view, "heal_pressed")
	view.set_pending(true)
	view.update_context(_ctx({"infantry": 20, "scouts": 0, "heavy": 0, "porters": 0}))
	assert_true(_heal_button(view).disabled, "off while the request is out")

func test_a_group_in_care_shows_its_countdown_and_no_button() -> void:
	var view: HealView = add_child_autofree(HealView.new())
	view.update_context(_ctx({"infantry": 3, "scouts": 0, "heavy": 0, "porters": 0}, {"troops": {"infantry": 5, "scouts": 0, "heavy": 0, "porters": 0}, "startedAt": 0, "endsAt": 61000}))
	var texts := _texts(view)
	assert_has(texts, Loc.t("heal.inCare", {"count": "5"}))
	assert_has(texts, Fmt.duration(60000.0))
	assert_null(_heal_button(view))

func test_nothing_to_pay_with_says_why() -> void:
	var view: HealView = add_child_autofree(HealView.new())
	view.update_context(_ctx({"infantry": 4, "scouts": 0, "heavy": 0, "porters": 0}, null, {"food": 0.0, "materiel": 0.0, "funds": 0.0, "support": 0.0}))
	assert_has(_texts(view), Loc.t("reason.insufficient"))
	assert_true(_heal_button(view).disabled)

func test_the_ring_offers_heal_on_the_infirmary_only() -> void:
	assert_eq(ActionRing.actions_for("infirmary"), ["upgrade", "info", "heal"])
	assert_eq(ActionRing.actions_for("watchtower"), ["upgrade", "info"])
	assert_eq(ActionRing.label_for("heal"), Loc.t("heal.title"))

func test_the_new_texts_exist_in_english_and_arabic() -> void:
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		for key in ["building.watchtower.name", "building.infirmary.name", "heal.title", "heal.button", "forecast.title", "forecast.likely_victory", "forecast.close", "forecast.likely_defeat", "reason.no_wounded", "reason.infirmary_busy"]:
			assert_ne(Loc.t(key), key, "%s in %s" % [key, lang])

func test_forecast_lines_follow_what_the_tower_shows() -> void:
	assert_eq(ForecastModel.lines({"watchtower": 1, "forecast": null}).map(func(l: Dictionary) -> String: return l["key"]), ["forecast.unavailable"])
	var low := ForecastModel.lines({"watchtower": 1, "forecast": {"verdict": "close", "lost": null, "wounded": null, "chance": null, "nextLevel": 3}})
	assert_eq(low.map(func(l: Dictionary) -> String: return l["key"]), ["forecast.close", "forecast.more"])
	assert_eq(low[0]["tone"], "even")
	var high := ForecastModel.lines({"watchtower": 5, "forecast": {"verdict": "likely_victory", "lost": 2, "wounded": 6, "chance": 95, "nextLevel": null}})
	assert_eq(high.map(func(l: Dictionary) -> String: return l["key"]), ["forecast.likely_victory", "forecast.losses", "forecast.chance"])
	assert_eq(high[1]["vars"], {"lost": 2, "wounded": 6})
	assert_false(ForecastModel.is_view({"forecast": {"verdict": "maybe"}, "watchtower": 1}))

func test_a_forecast_needs_someone_sent() -> void:
	assert_null(ForecastModel.request(2, {"infantry": 0}, null))
	assert_eq(ForecastModel.request(2, {"infantry": 5, "scouts": -3}, {"lead": "hill_commander", "deputies": []}), {"level": 2, "troops": {"infantry": 5, "scouts": 0, "heavy": 0, "porters": 0}, "heroes": {"lead": "hill_commander", "deputies": []}})

func test_the_session_asks_the_server_and_drops_a_bad_answer() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	var view := {"forecast": {"verdict": "likely_defeat", "lost": null, "wounded": null, "chance": null, "nextLevel": 3}, "watchtower": 1, "now": 10}
	api.replies = [{"ok": true, "status": 200, "data": view}, {"ok": true, "status": 200, "data": {"ok": false, "reason": "hero_busy", "now": 11}}]
	assert_eq((await s.scout({"level": 1, "troops": {"infantry": 3}}))["forecast"]["verdict"], "likely_defeat")
	assert_eq(api.paths[0], "/v1/scout")
	assert_eq(await s.scout({"level": 1, "troops": {"infantry": 3}}), {})

func test_the_march_sheet_shows_the_forecast_for_the_latest_choice_only() -> void:
	var api := FakeApi.new()
	var session := Session.new(api, Clock.new())
	session.apply({"state": {"resources": {}, "levels": {"hero_hall": 1}, "lastUpdated": 1, "troops": {"infantry": 10, "scouts": 4, "heavy": 0, "porters": 0},
		"heroes": {"owned": {}, "pity": 0}, "marches": []}, "now": 5})
	var sheet: MarchSheet = add_child_autofree(MarchSheet.new())
	sheet.setup(session)
	sheet.open({"id": "n1", "kind": "patrol", "level": 1, "x": 13, "y": 14, "region": 1}, Vector2i(10, 10))
	assert_has(_texts(sheet), Loc.t("forecast.title"))
	api.replies = [{"ok": true, "status": 200, "data": {"forecast": {"verdict": "likely_victory", "lost": null, "wounded": null, "chance": null, "nextLevel": 3}, "watchtower": 1, "now": 6}}]
	sheet.call("_set_count", "infantry", 8)
	await wait_seconds(MarchSheet.FORECAST_WAIT_S + 0.2)
	await wait_process_frames(3)
	assert_eq(api.posted.size(), 1, "one request for the settled choice")
	assert_eq(api.posted[0]["troops"]["infantry"], 8)
	assert_has(_texts(sheet), Loc.t("forecast.likely_victory"))
