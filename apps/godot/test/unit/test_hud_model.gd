extends GutTest
## What the HUD shows: a bar per resource against its own cap, and the builders' pill.

func _caps(hq: int) -> Dictionary:
	return Balance.storage_cap(hq)

func _chip(chips: Array, id: String) -> Dictionary:
	for c: Dictionary in chips:
		if c["id"] == id:
			return c
	return {}

func test_there_is_a_chip_per_resource_in_order() -> void:
	var chips := HudModel.chips({}, 1)
	var ids := []
	for c: Dictionary in chips:
		ids.append(c["id"])
	assert_eq(ids, Balance.data()["resourceIds"])

func test_each_chip_uses_its_own_cap() -> void:
	var caps := _caps(3)
	var chips := HudModel.chips({"food": 100.0, "materiel": 100.0, "funds": 100.0, "support": 100.0}, 3)
	for id: String in caps:
		assert_eq(_chip(chips, id)["cap"], float(caps[id]), id)
		assert_almost_eq(float(_chip(chips, id)["fraction"]), 100.0 / float(caps[id]), 1e-9, id)

func test_the_state_turns_near_at_ninety_percent_and_full_at_the_cap() -> void:
	var cap := float(_caps(1)["food"])
	assert_eq(_chip(HudModel.chips({"food": cap * 0.5}, 1), "food")["state"], "normal")
	assert_eq(_chip(HudModel.chips({"food": cap * 0.9}, 1), "food")["state"], "near")
	assert_eq(_chip(HudModel.chips({"food": cap - 0.5}, 1), "food")["state"], "near")
	assert_eq(_chip(HudModel.chips({"food": cap}, 1), "food")["state"], "full")

func test_an_amount_above_the_cap_is_full_and_the_bar_stops_at_one() -> void:
	var cap := float(_caps(1)["food"])
	var c := _chip(HudModel.chips({"food": cap * 3.0}, 1), "food")
	assert_eq(c["state"], "full")
	assert_eq(c["fraction"], 1.0)
	assert_eq(c["amount"], cap * 3.0, "the amount itself is kept")

func test_a_missing_resource_is_empty() -> void:
	var c := _chip(HudModel.chips({}, 1), "support")
	assert_eq(c["amount"], 0.0)
	assert_eq(c["fraction"], 0.0)
	assert_eq(c["state"], "normal")

func test_the_pill_is_shown_idle_on_the_base_and_hidden_idle_on_the_map() -> void:
	assert_true(HudModel.pill(null, 1000, "base")["visible"])
	assert_false(HudModel.pill(null, 1000, "base")["busy"])
	assert_false(HudModel.pill(null, 1000, "map")["visible"])

func test_a_running_upgrade_shows_on_both_screens_with_its_countdown() -> void:
	var job := {"building": "farm", "toLevel": 3, "startedAt": 1000, "endsAt": 61_000}
	for screen in ["base", "map"]:
		var p := HudModel.pill(job, 11_000, screen)
		assert_true(p["visible"], screen)
		assert_true(p["busy"])
		assert_eq(p["building"], "farm")
		assert_eq(p["level"], 3)
		assert_eq(p["remainingMs"], 50_000)
	assert_eq(HudModel.pill(job, 99_000, "base")["remainingMs"], 0, "never below zero")

func test_hud_texts_exist_in_en_and_ar() -> void:
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		for k in ["queue.idle", "queue.busy", "sync.offline"]:
			assert_ne(Loc.t(k), k, "%s: %s" % [lang, k])
	TranslationServer.set_locale("en")

func test_the_pill_knows_how_far_the_upgrade_is_whatever_the_clock_says() -> void:
	var job := {"building": "farm", "toLevel": 2, "startedAt": 1000, "endsAt": 5000}
	assert_almost_eq(float(HudModel.pill(job, 3000, "base")["fraction"]), 0.5, 0.001)
	assert_eq(float(HudModel.pill(job, 0, "base")["fraction"]), 0.0, "a clock before the start")
	assert_eq(float(HudModel.pill(job, 9000, "base")["fraction"]), 1.0, "after the end")
	var instant := {"building": "farm", "toLevel": 2, "startedAt": 5000, "endsAt": 5000}
	assert_eq(float(HudModel.pill(instant, 5000, "base")["fraction"]), 1.0, "no length: done")
	assert_eq(float(HudModel.pill(null, 3000, "base")["fraction"]), 0.0)
