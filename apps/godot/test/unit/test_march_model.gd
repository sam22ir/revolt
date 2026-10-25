extends GutTest
## MarchModel against the numbers the real client rules give (data/march-fixtures.json).

func _fixtures() -> Dictionary:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/march-fixtures.json")), OK)
	return parsed.data

func _state(c: Dictionary) -> Dictionary:
	var marches: Array = []
	for i in int(c["marches"]):
		marches.append({})
	if c["busy"] is Dictionary:
		marches[marches.size() - 1] = {"heroes": {"lead": c["busy"]["lead"], "deputies": c["busy"]["deputies"], "levels": {}}}
	return {"troops": c["home"], "marches": marches, "heroes": {"owned": c["owned"], "pity": 0}}

func test_travel_time_and_carry_match_the_client() -> void:
	var rows: Array = _fixtures()["travel"]
	assert_eq(rows.size(), 63)
	for r: Dictionary in rows:
		var label := "%s -> %s with %s" % [r["from"], r["to"], r["troops"]]
		var got := MarchModel.travel_ms(float(r["from"]["x"]), float(r["from"]["y"]), float(r["to"]["x"]), float(r["to"]["y"]), r["troops"])
		assert_eq(got, int(r["travel_ms"]) if r["travel_ms"] != null else -1, label + " travel")
		assert_eq(MarchModel.carry(r["troops"]), int(r["carry"]), label + " carry")

func test_the_reason_matches_the_client_in_every_case() -> void:
	var rows: Array = _fixtures()["checks"]
	assert_eq(rows.size(), 392)
	var seen := {}
	for r: Dictionary in rows:
		var want := String(r["reason"]) if r["reason"] != null else ""
		seen[want] = true
		var got := MarchModel.check(_state(r), r["troops"], r["loadout"])
		assert_eq(got, want, "%s troops %s loadout %s" % [r["scenario"], r["troops"], r["loadout"]])
	for reason in ["", "no_troops", "not_enough_troops", "too_many_marches", "too_many_deputies", "duplicate_hero", "not_owned", "hero_busy"]:
		assert_true(seen.has(reason), "the fixtures cover " + reason)

func test_available_heroes_match_the_client() -> void:
	var rows: Array = _fixtures()["available"]
	assert_eq(rows.size(), 14)
	for r: Dictionary in rows:
		var state := {"heroes": {"owned": r["owned"]}, "marches": []}
		if r["busy"] is Dictionary:
			state["marches"] = [{"heroes": {"lead": r["busy"]["lead"], "deputies": r["busy"]["deputies"], "levels": {}}}]
		assert_eq(MarchModel.available_heroes(state, r["background"]), r["heroes"], "%s %s" % [r["background"], r["scenario"]])

func test_hero_bonus_matches_the_client() -> void:
	var rows: Array = _fixtures()["bonus"]
	assert_eq(rows.size(), 24)
	for r: Dictionary in rows:
		var owned := {}
		for id: String in [r["lead"]] + r["loadout"]["deputies"]:
			owned[id] = {"level": int(r["level"]), "shards": 0}
		var state := {"heroes": {"owned": owned}}
		var label := "%s level %s" % [r["lead"], r["level"]]
		var solo := MarchModel.hero_bonus(state, {"lead": r["lead"], "deputies": []})
		assert_eq([solo["attack"], solo["defense"]], [int(r["solo"]["attack"]), int(r["solo"]["defense"])], label + " solo")
		var squad := MarchModel.hero_bonus(state, r["loadout"])
		assert_eq([squad["attack"], squad["defense"]], [int(r["squad"]["attack"]), int(r["squad"]["defense"])], label + " squad")

func test_no_heroes_bring_nothing() -> void:
	assert_eq(MarchModel.hero_bonus({}, null), {"attack": 0, "defense": 0})

func test_loadout_from_the_picker_slots() -> void:
	assert_eq(MarchModel.loadout_from_picks(["", "", ""]), null)
	assert_eq(MarchModel.loadout_from_picks(["a", "", ""]), {"lead": "a", "deputies": []})
	assert_eq(MarchModel.loadout_from_picks(["", "b", "c"]), {"lead": "b", "deputies": ["c"]})

func test_counts_are_clamped_to_what_is_at_home() -> void:
	assert_eq(MarchModel.clamp_count(-3, 5), 0)
	assert_eq(MarchModel.clamp_count(9, 5), 5)
	assert_eq(MarchModel.clamp_count(4, 5), 4)
	assert_eq(MarchModel.clamp_count(4, -2), 0)
