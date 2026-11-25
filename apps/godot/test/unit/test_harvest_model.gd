extends GutTest
## HarvestModel: the harvest sheet's numbers against the server's rules (packages/rules/src/sites.ts): fill time (rounded up, capped at
## the harvest window), the load brought home, the total time away, and the checks in the server's order (checkHarvest).

const FARM := {"id": "farmland:0", "kind": "farmland", "level": 1, "x": 13, "y": 14, "occupied": false, "mine": false}
const QUARRY := {"id": "quarry:0", "kind": "quarry", "level": 1, "x": 13, "y": 14, "occupied": false, "mine": false}

func _state(home: Dictionary, marches: Array = []) -> Dictionary:
	return {"troops": home, "marches": marches, "heroes": {"owned": {}, "pity": 0}}

func _march(extra := {}) -> Dictionary:
	var m := {"id": "m", "departAt": 0, "arriveAt": 1000, "returnAt": 2000}
	m.merge(extra, true)
	return m

func test_fill_time_rounds_up_at_the_site_rate() -> void:
	# 10 carry at 700 per hour is 51 428.57 ms: the server rounds up.
	assert_eq(HarvestModel.fill_ms(10, "quarry", 3), 51429)
	# One porter is 60 carry at 300 per hour: exactly 12 minutes.
	assert_eq(HarvestModel.fill_ms(60, "farmland", 1), 720000)
	assert_eq(HarvestModel.fill_ms(0, "farmland", 1), 0, "no carry, no fill")

func test_fill_time_is_capped_at_the_harvest_window() -> void:
	assert_eq(HarvestModel.max_ms(), 28800000)
	# 1 800 carry at 200 per hour would take 32.4 million ms: capped at 8 hours.
	assert_eq(HarvestModel.fill_ms(1800, "quarry", 1), 28800000)
	# The load is the rate over the 8 hours, not the whole carry: 200 × 8 = 1 600.
	assert_eq(HarvestModel.expected_load(1800, "quarry", 1), 1600)

func test_expected_load_is_the_whole_carry_when_it_fills() -> void:
	assert_eq(HarvestModel.expected_load(60, "farmland", 1), 60)
	assert_eq(HarvestModel.expected_load(10, "quarry", 3), 10)

func test_rates_come_from_the_balance_data() -> void:
	assert_eq(HarvestModel.rate_per_hour("farmland", 1), 300)
	assert_eq(HarvestModel.rate_per_hour("quarry", 3), 700)
	assert_eq(HarvestModel.rate_per_hour("farmland", 9), 0, "a level the table does not know")

func test_preview_gives_travel_carry_fill_and_time_away() -> void:
	var quarry := HarvestModel.preview(_state({"infantry": 10}), Vector2i(10, 10), QUARRY, {"infantry": 1, "scouts": 0, "heavy": 0, "porters": 0})
	# Five tiles at two tiles a minute (the infantry's speed) is 150 000 ms one way.
	assert_eq(quarry["travel_ms"], 150000)
	assert_eq(quarry["carry"], 10)
	assert_eq(quarry["rate"], 200)
	# 10 carry at 200 per hour is 180 000 ms, three minutes, and the march is home one leg after it leaves.
	assert_eq(quarry["fill_ms"], 180000)
	assert_eq(quarry["away_ms"], 150000 * 2 + 180000)
	assert_eq(quarry["load"], 10)
	assert_eq(quarry["reason"], "")

func test_porters_only_is_refused_as_no_troops() -> void:
	var p := HarvestModel.preview(_state({"porters": 5}), Vector2i(10, 10), FARM, {"infantry": 0, "scouts": 0, "heavy": 0, "porters": 5})
	assert_eq(p["reason"], "no_troops")

func test_too_many_troops_at_home_is_refused() -> void:
	var p := HarvestModel.preview(_state({"infantry": 10}), Vector2i(10, 10), FARM, {"infantry": 11, "scouts": 0, "heavy": 0, "porters": 0})
	assert_eq(p["reason"], "not_enough_troops")

func test_harvest_marches_count_against_the_march_slots() -> void:
	var troops := {"infantry": 1, "scouts": 0, "heavy": 0, "porters": 0}
	var one := _state({"infantry": 10}, [_march({"siteId": "quarry:0"})])
	assert_eq(HarvestModel.check(one, troops, FARM), "", "one march out leaves a slot")
	var two := _state({"infantry": 10}, [_march({"siteId": "quarry:0"}), _march({})])
	assert_eq(HarvestModel.check(two, troops, FARM), "too_many_marches", "two marches out is the limit, harvests included")

func test_a_taken_site_is_refused_before_the_troops() -> void:
	var troops := {"infantry": 1, "scouts": 0, "heavy": 0, "porters": 0}
	var taken := FARM.duplicate()
	taken["occupied"] = true
	assert_eq(HarvestModel.check(_state({"infantry": 10}), troops, taken), "site_taken")
	var mine := FARM.duplicate()
	mine["occupied"] = true
	mine["mine"] = true
	assert_eq(HarvestModel.check(_state({"infantry": 10}), troops, mine), "site_taken", "your own harvest holds it too")

func test_a_site_your_own_march_already_holds_is_taken_even_when_the_snapshot_lags() -> void:
	var troops := {"infantry": 1, "scouts": 0, "heavy": 0, "porters": 0}
	assert_eq(HarvestModel.check(_state({"infantry": 10}, [_march({"siteId": "farmland:0"})]), troops, FARM), "site_taken")

func test_a_missing_site_is_refused() -> void:
	assert_eq(HarvestModel.check(_state({"infantry": 10}), {"infantry": 1, "scouts": 0, "heavy": 0, "porters": 0}, {}), "no_such_site")
	assert_eq(HarvestModel.preview(_state({"infantry": 10}), Vector2i(10, 10), {}, {"infantry": 1, "scouts": 0, "heavy": 0, "porters": 0})["travel_ms"], -1)
