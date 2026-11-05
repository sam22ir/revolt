extends GutTest
## MarchesModel against the stage and position the real client code gives (data/marches-fixtures.json).

func _fixtures() -> Dictionary:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/marches-fixtures.json")), OK)
	return parsed.data

func test_positions_match_the_client_at_every_moment() -> void:
	var rows: Array = _fixtures()["positions"]
	assert_eq(rows.size(), 132)
	for r: Dictionary in rows:
		var got := MarchesModel.position(r["march"], float(r["now"]))
		var label := "%s at %s" % [r["march"]["id"], r["now"]]
		assert_eq(got["leg"], r["leg"], label + " leg")
		assert_almost_eq(float(got["x"]), float(r["x"]), 1e-9, label + " x")
		assert_almost_eq(float(got["y"]), float(r["y"]), 1e-9, label + " y")

func test_stages_match_the_client_at_every_moment() -> void:
	var rows: Array = _fixtures()["stages"]
	assert_eq(rows.size(), 528)
	for r: Dictionary in rows:
		var m := {"departAt": r["departAt"], "arriveAt": r["arriveAt"], "returnAt": r["returnAt"]}
		if r["rally"]:
			m["rallyId"] = "r"
		if r["result"] != null:
			m["outcome"] = {"result": r["result"]}
		assert_eq(MarchesModel.stage(m, float(r["now"])), r["stage"], "%s rally=%s result=%s now=%s" % [r["departAt"], r["rally"], r["result"], r["now"]])

func _march(extra := {}) -> Dictionary:
	var m := {"id": "m", "target": {"npcId": "n", "level": 1, "x": 32, "y": 53}, "from": {"x": 43, "y": 54}, "to": {"x": 32, "y": 53},
		"departAt": 1000.0, "arriveAt": 5000.0, "returnAt": 9000.0, "outcome": null}
	m.merge(extra, true)
	return m

func test_a_row_follows_the_journey_and_names_the_countdown() -> void:
	var out: Dictionary = MarchesModel.rows([_march()], 2000.0)[0]
	assert_eq([out["stage"], out["time_key"], out["ms"], out["kind"], out["level"]], ["outbound", "march.arrivesIn", 3000.0, "patrol", 1])
	var fighting: Dictionary = MarchesModel.rows([_march()], 6000.0)[0]
	assert_eq([fighting["stage"], fighting["time_key"]], ["fighting", ""])
	var back: Dictionary = MarchesModel.rows([_march({"outcome": {"result": "victory"}})], 6000.0)[0]
	assert_eq([back["stage"], back["result"], back["time_key"], back["ms"]], ["returning", "victory", "march.returnsIn", 3000.0])
	var gathering: Dictionary = MarchesModel.rows([_march({"rallyId": "r"})], 500.0)[0]
	assert_eq([gathering["stage"], gathering["time_key"], gathering["ms"]], ["gathering", "march.departsIn", 500.0])

func test_a_row_lists_the_heroes_lead_first_and_an_unknown_level_has_no_kind() -> void:
	var led: Dictionary = MarchesModel.rows([_march({"heroes": {"lead": "a", "deputies": ["b", "c"], "levels": {}}})], 2000.0)[0]
	assert_eq(led["heroes"], ["a", "b", "c"])
	assert_eq(MarchesModel.rows([_march()], 2000.0)[0]["heroes"], [])
	var odd := _march()
	odd["target"]["level"] = 99
	assert_eq(MarchesModel.rows([odd], 2000.0)[0]["kind"], "")

func _harvest(extra := {}) -> Dictionary:
	var m := {"id": "h", "target": {"npcId": "farmland:0", "level": 0, "x": 32, "y": 53}, "from": {"x": 43, "y": 54}, "to": {"x": 32, "y": 53},
		"siteId": "farmland:0", "departAt": 1000.0, "arriveAt": 5000.0, "leaveSiteAt": 9000.0, "returnAt": 13000.0, "outcome": null}
	m.merge(extra, true)
	return m

func test_a_harvest_goes_out_waits_at_the_site_then_comes_home() -> void:
	var m := _harvest()
	assert_eq([MarchesModel.stage(m, 2000.0), MarchesModel.stage(m, 6000.0), MarchesModel.stage(m, 8999.0), MarchesModel.stage(m, 9000.0)],
		["outbound", "at_site", "at_site", "returning"])
	var waiting := MarchesModel.position(m, 6000.0)
	assert_eq([waiting["leg"], waiting["x"], waiting["y"]], ["at_site", 32.0, 53.0], "on the site tile while it works")
	var back := MarchesModel.position(m, 11000.0)
	assert_eq(back["leg"], "returning")
	assert_almost_eq(float(back["x"]), 37.5, 1e-9, "halfway home from the site")
	assert_eq(MarchesModel.position(m, 13000.0)["leg"], "done")

func test_a_harvest_is_at_the_site_whatever_its_outcome_says_until_it_leaves() -> void:
	var m := _harvest({"outcome": {"result": "victory"}})
	assert_eq(MarchesModel.stage(m, 6000.0), "at_site")
	assert_eq(MarchesModel.stage(m, 10000.0), "returning")

func test_a_harvest_row_names_the_resource_and_never_says_victory() -> void:
	var at_site: Dictionary = MarchesModel.rows([_harvest({"outcome": {"result": "victory"}})], 6000.0)[0]
	assert_eq([at_site["stage"], at_site["result"], at_site["time_key"], at_site["ms"]], ["at_site", "", "march.leavesSiteIn", 3000.0])
	assert_eq([at_site["harvest"], at_site["resource"], at_site["kind"]], [true, "food", "farmland"])
	var home: Dictionary = MarchesModel.rows([_harvest({"outcome": {"result": "victory"}})], 10000.0)[0]
	assert_eq([home["stage"], home["result"], home["time_key"], home["ms"]], ["returning", "", "march.returnsIn", 3000.0])
	var going: Dictionary = MarchesModel.rows([_harvest()], 2000.0)[0]
	assert_eq([going["stage"], going["time_key"], going["ms"]], ["outbound", "march.arrivesIn", 3000.0])
	var quarry: Dictionary = MarchesModel.rows([_harvest({"siteId": "quarry:4"})], 2000.0)[0]
	assert_eq([quarry["kind"], quarry["resource"]], ["quarry", "materiel"])

func test_a_harvest_is_no_fight_and_a_row_without_leave_time_uses_the_travel_leg() -> void:
	assert_false(MarchesModel.battle_flash(_harvest(), 5000.0))
	var m := _harvest()
	m.erase("leaveSiteAt")
	assert_eq(MarchesModel.stage(m, 8999.0), "at_site")
	assert_eq(MarchesModel.stage(m, 9000.0), "returning", "returnAt 13000 less the 4000 travel leg")

func test_the_fight_marker_shows_for_five_seconds_after_arrival() -> void:
	var m := _march()
	assert_false(MarchesModel.battle_flash(m, 4999.0))
	assert_true(MarchesModel.battle_flash(m, 5000.0))
	assert_true(MarchesModel.battle_flash(m, 9999.0))
	assert_false(MarchesModel.battle_flash(m, 10000.0))

func test_a_march_that_is_already_home_has_no_row() -> void:
	assert_eq(MarchesModel.rows([_march()], 9000.0), [])
	assert_eq(MarchesModel.rows([_march()], 12000.0), [])
	assert_eq(MarchesModel.rows([_march(), _march({"id": "late", "returnAt": 20000.0})], 12000.0).size(), 1)
	var last: Dictionary = MarchesModel.rows([_march({"outcome": {"result": "victory"}})], 8999.0)[0]
	assert_eq(last["ms"], 1.0)
