extends GutTest
## What the building panel shows, as data: the three modes, the lacking costs, the countdown and the structure key.

const NOW := 1_000_000

func _levels(over: Dictionary = {}) -> Dictionary:
	var l := {"hq": 3, "farm": 1, "armory": 1, "treasury": 1, "barracks": 1, "hero_hall": 1}
	l.merge(over, true)
	return l

func _rich() -> Dictionary:
	return {"food": 9999.0, "materiel": 9999.0, "funds": 9999.0, "support": 9999.0}

func test_a_producer_shows_its_production_and_the_next_level() -> void:
	var m := BuildingPanelModel.build("farm", _levels(), _rich(), null, NOW)
	assert_eq(m["mode"], "next")
	assert_eq(m["production"]["resource"], "food")
	assert_eq(m["production"]["perHour"], 120.0)
	assert_eq(m["next"]["toLevel"], 2)
	assert_eq(m["next"]["production"], 180.0, "the rate at the next level")
	assert_true(m["next"]["ok"])
	assert_eq(m["next"]["durationMs"], 30_000)

func test_the_hq_shows_the_storage_cap_besides_its_own_production() -> void:
	var m := BuildingPanelModel.build("hq", _levels(), _rich(), null, NOW)
	assert_eq(m["production"]["resource"], "support")
	assert_eq(m["storage"], int(Balance.storage_cap(3)["food"]))
	var barracks := BuildingPanelModel.build("barracks", _levels(), _rich(), null, NOW)
	assert_null(barracks["production"], "a building that produces nothing has no production row")
	assert_null(barracks["storage"])

func test_costs_list_only_priced_resources_and_mark_the_lacking_ones() -> void:
	var wallet := _rich()
	wallet["funds"] = 10.0
	var m := BuildingPanelModel.build("farm", _levels(), wallet, null, NOW)
	var by_id := {}
	for c: Dictionary in m["next"]["cost"]:
		by_id[c["id"]] = c
	assert_false(by_id.has("support"), "a zero price is not listed")
	assert_true(by_id["funds"]["lacking"])
	assert_false(by_id["food"]["lacking"])
	assert_false(m["next"]["ok"])
	assert_eq(m["next"]["reason"], "insufficient")

func test_the_hq_gate_is_the_reason_when_the_hq_is_too_low() -> void:
	var m := BuildingPanelModel.build("farm", _levels({"hq": 1}), _rich(), null, NOW)
	assert_eq(m["next"]["reason"], "hq_gate")

func test_another_job_blocks_with_queue_busy() -> void:
	var job := {"building": "armory", "toLevel": 2, "startedAt": NOW - 1000, "endsAt": NOW + 29_000}
	var m := BuildingPanelModel.build("farm", _levels(), _rich(), job, NOW)
	assert_eq(m["mode"], "next")
	assert_eq(m["next"]["reason"], "queue_busy")

func test_its_own_job_shows_the_countdown_and_the_progress() -> void:
	var job := {"building": "farm", "toLevel": 2, "startedAt": NOW - 10_000, "endsAt": NOW + 20_000}
	var m := BuildingPanelModel.build("farm", _levels(), _rich(), job, NOW)
	assert_eq(m["mode"], "upgrading")
	assert_eq(m["job"]["toLevel"], 2)
	assert_eq(m["job"]["remainingMs"], 20_000)
	assert_almost_eq(float(m["job"]["fraction"]), 1.0 / 3.0, 1e-9)
	assert_null(m["next"])

func test_a_finished_job_waiting_for_the_server_counts_down_to_zero_and_not_below() -> void:
	var job := {"building": "farm", "toLevel": 2, "startedAt": NOW - 40_000, "endsAt": NOW - 10_000}
	var m := BuildingPanelModel.build("farm", _levels(), _rich(), job, NOW)
	assert_eq(m["job"]["remainingMs"], 0)
	assert_eq(m["job"]["fraction"], 1.0)

func test_max_level_has_no_next_block() -> void:
	var m := BuildingPanelModel.build("farm", _levels({"farm": 10, "hq": 10}), _rich(), null, NOW)
	assert_eq(m["mode"], "max")
	assert_null(m["next"])

func test_the_key_changes_with_structure_but_not_with_time() -> void:
	var job := {"building": "farm", "toLevel": 2, "startedAt": NOW - 10_000, "endsAt": NOW + 20_000}
	var a := BuildingPanelModel.build("farm", _levels(), _rich(), job, NOW)
	var b := BuildingPanelModel.build("farm", _levels(), _rich(), job, NOW + 5000)
	assert_eq(a["key"], b["key"], "the countdown ticking does not rebuild the panel")
	var poor := _rich()
	poor["food"] = 0.0
	var c := BuildingPanelModel.build("farm", _levels(), _rich(), null, NOW)
	var d := BuildingPanelModel.build("farm", _levels(), poor, null, NOW)
	assert_ne(c["key"], d["key"], "becoming unaffordable rebuilds it")
	var e := BuildingPanelModel.build("farm", _levels({"farm": 2}), _rich(), null, NOW)
	assert_ne(c["key"], e["key"], "a new level rebuilds it")

func test_every_building_has_a_model() -> void:
	for id: String in Balance.data()["buildingIds"]:
		var m := BuildingPanelModel.build(id, _levels(), _rich(), null, NOW)
		assert_eq(m["id"], id)
		assert_true(m["mode"] in ["next", "max", "upgrading"])

## The texts the base screen builds from dynamic keys: the literal-key test of rule 5 cannot see these.
func test_building_resource_panel_and_time_keys_exist_in_en_and_ar() -> void:
	var keys: Array[String] = ["panel.level", "panel.production", "panel.perHour", "panel.storage", "panel.nextLevel", "panel.cost",
		"panel.duration", "panel.upgrade", "panel.upgrading", "panel.maxLevel", "panel.close", "nav.map", "nav.base",
		"time.h", "time.m", "time.s", "time.done", "reason.unreachable"]
	for id: String in Balance.data()["buildingIds"]:
		keys.append("building.%s.name" % id)
		keys.append("building.%s.desc" % id)
	for r: String in Balance.data()["resourceIds"]:
		keys.append("resource." + r)
	for r in UpgradeView.REASONS:
		keys.append("reason." + r)
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		for k in keys:
			assert_ne(Loc.t(k), k, "%s: %s" % [lang, k])
	TranslationServer.set_locale("en")
