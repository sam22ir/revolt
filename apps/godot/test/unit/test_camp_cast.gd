extends GutTest
## The camp shows the player's game (docs/camp-life-plan.md): each state brings its people and props, all from the time it is
## given, clear of the buildings, and never more than the cap.

const NOW := 1_793_800_000_000
const LEVELS := {"hq": 1, "farm": 1, "armory": 1, "treasury": 1, "barracks": 1, "hero_hall": 1}

func _sum(levels := LEVELS, queue: Variant = null, state := {}, amounts := {}) -> Dictionary:
	return CampSummary.build(levels, queue, state, amounts)

func _kinds(list: Array) -> Array:
	return list.map(func(f: Dictionary) -> String: return f["kind"])

func _count(list: Array, kind: String) -> int:
	return _kinds(list).count(kind)

func test_a_quiet_camp_casts_no_one() -> void:
	assert_eq(CampCast.cast({}, NOW), [])
	assert_eq(CampCast.cast(_sum(), NOW), [], "HQ 1, nothing running, nothing full")

func test_two_workers_stand_in_front_of_the_building_being_upgraded() -> void:
	for id: String in CampLayout.BUILDINGS:
		var s := _sum(LEVELS, {"building": id, "toLevel": 2, "startedAt": NOW, "endsAt": NOW + 60000})
		var workers := CampCast.cast(s, NOW).filter(func(f: Dictionary) -> bool: return f["kind"] == "worker")
		assert_eq(workers.size(), 2, id)
		for w: Dictionary in workers:
			assert_eq(CampLayout.building_at(w["at"]), "", "%s: a worker stands on open ground" % id)
			assert_false(CampArt.is_behind(id, 1, w["at"]), "%s: in front of it" % id)

func test_fighters_drill_while_troops_train() -> void:
	var s := _sum(LEVELS, null, {"training": {"troop": "infantry", "count": 5, "startedAt": NOW, "endsAt": NOW + 9000}})
	assert_eq(_count(CampCast.cast(s, NOW), "drill"), CampLayout.DRILL.size())

func test_the_wounded_rest_by_the_hero_hall_one_per_ten() -> void:
	assert_eq(_count(CampCast.cast(_sum(LEVELS, null, {"wounded": {"infantry": 1}}), NOW), "wounded"), 1)
	assert_eq(_count(CampCast.cast(_sum(LEVELS, null, {"wounded": {"infantry": 10, "scouts": 1}}), NOW), "wounded"), 2)
	assert_eq(_count(CampCast.cast(_sum(LEVELS, null, {"wounded": {"infantry": 500}}), NOW), "wounded"), CampLayout.WOUNDED.size(), "no more than the spots")

func test_a_full_producer_piles_its_stock_and_agrees_with_the_hud() -> void:
	var cap := Balance.storage_cap(1)
	var s := _sum(LEVELS, null, {}, {"food": cap["food"], "materiel": cap["materiel"] * 0.95, "funds": 0.0, "support": 0.0})
	assert_eq(s["piles"], {"food": "full", "materiel": "near"})
	var kinds := _kinds(CampCast.cast(s, NOW))
	assert_has(kinds, "sacks_big")
	assert_has(kinds, "crates_small")
	assert_does_not_have(kinds, "chest_small")

func test_low_food_stops_the_smoke_and_sends_the_farmer_away() -> void:
	var cap := Balance.storage_cap(1)
	var low := _sum(LEVELS, null, {}, {"food": cap["food"] * 0.1})
	assert_true(low["food_low"])
	assert_does_not_have(_kinds(CampLife.figures(NOW, low)), "farmer")
	assert_has(_kinds(CampLife.figures(NOW, _sum(LEVELS, null, {}, {"food": cap["food"] * 0.5}))), "farmer")

func test_a_column_walks_out_after_a_march_leaves_and_in_before_it_is_back() -> void:
	var s := _sum(LEVELS, null, {"marches": [{"departAt": NOW, "arriveAt": NOW + 600000, "returnAt": NOW + 1200000}]})
	assert_eq(CampCast.cast(s, NOW - 1), [], "not left yet")
	assert_eq(CampCast.cast(s, NOW).size(), 1, "the first steps out")
	assert_eq(CampCast.cast(s, NOW + 5000).size(), CampLayout.COLUMN_OUT.size(), "the whole column on the way")
	assert_eq(CampCast.cast(s, NOW + 300000), [], "out of sight while it is away")
	assert_eq(_kinds(CampCast.cast(s, NOW + 1200000 - 5000)), CampLayout.COLUMN_IN, "walking in")
	assert_eq(CampCast.cast(s, NOW + 1200000 - 1000).size(), 1, "the last one nearly home")
	assert_eq(CampCast.cast(s, NOW + 1200001), [], "home")

func test_a_column_keeps_to_the_way_out() -> void:
	var s := _sum(LEVELS, null, {"marches": [{"departAt": NOW, "arriveAt": NOW + 600000, "returnAt": NOW + 1200000}]})
	for t in range(0, 60000, 1500):
		for f: Dictionary in CampCast.cast(s, NOW + t) + CampCast.cast(s, NOW + 1200000 - t):
			assert_eq(CampLayout.building_at(f["at"]), "", "clear of the buildings at %d" % t)

func test_tents_go_up_with_the_hq() -> void:
	assert_eq(_count(CampCast.cast(_sum({"hq": 1}), NOW), "tent"), 0)
	assert_eq(_count(CampCast.cast(_sum({"hq": 4}), NOW), "tent"), 2)
	assert_eq(_count(CampCast.cast(_sum({"hq": 10}), NOW), "tent"), CampLayout.TENTS.size())

func test_support_brings_people_round_the_fire() -> void:
	var cap := Balance.storage_cap(1)
	var none := CampCast.cast(_sum(LEVELS, null, {}, {"support": 0.0}), NOW)
	assert_eq(_count(none, "fire"), 0)
	var full := CampCast.cast(_sum(LEVELS, null, {}, {"support": cap["support"]}), NOW)
	assert_eq(_count(full, "fire"), 1)
	assert_eq(_count(full, "sitting"), CampLayout.FIRE_PEOPLE)

func test_every_spot_is_clear_of_the_buildings() -> void:
	var spots: Array = CampLayout.DRILL + CampLayout.WOUNDED + CampLayout.PILES.values() + [CampLayout.FIRE]
	for t: Dictionary in CampLayout.TENTS:
		spots.append_array([t["at"], t["at"] + CampLayout.BY_TENT])
	for at: Vector2 in spots:
		assert_eq(CampLayout.building_at(at), "", "%s" % at)
		for id: String in CampLayout.BUILDINGS:
			assert_false(CampArt.is_behind(id, 1, at), "%s is not behind %s" % [at, id])

func test_everything_at_once_stays_under_the_cap_and_keeps_the_game_state_first() -> void:
	var cap := Balance.storage_cap(10)
	var marches := []
	for i in 5:
		marches.append({"departAt": NOW - i * 1000, "arriveAt": NOW + 600000, "returnAt": NOW + 1200000})
	var s := _sum({"hq": 10}, {"building": "farm", "toLevel": 2, "startedAt": NOW, "endsAt": NOW + 60000},
		{"training": {}, "wounded": {"infantry": 99}, "marches": marches}, cap)
	var list := CampCast.cast(s, NOW + 2000)
	assert_eq(list.size(), CampLayout.MAX_CAST)
	assert_eq(_count(list, "worker"), 2)
	assert_eq(_count(list, "fire"), 0, "the growth is dropped first")

func test_the_same_time_gives_the_same_camp_and_a_clock_going_back_is_fine() -> void:
	var s := _sum({"hq": 6}, {"building": "hq", "toLevel": 7, "startedAt": NOW, "endsAt": NOW + 60000},
		{"training": {}, "marches": [{"departAt": NOW, "arriveAt": NOW + 1, "returnAt": NOW + 2}]})
	assert_eq(CampCast.cast(s, NOW + 700), CampCast.cast(s, NOW + 700))
	assert_eq(CampCast.cast(s, NOW - 86_400_000).size(), CampCast.cast(s, NOW - 86_400_000 - 1).size(), "a day back")
	for f: Dictionary in CampCast.cast(s, -5):
		assert_between(int(f["frame"]), 0, CampLife.STEPS - 1)

func test_summary_ignores_odd_state() -> void:
	var s := _sum(LEVELS, null, {"wounded": "x", "marches": [null, {"departAt": NOW}], "training": null})
	assert_eq(s["wounded"], 0)
	assert_eq(s["marches"], [])
	assert_false(s["training"])
