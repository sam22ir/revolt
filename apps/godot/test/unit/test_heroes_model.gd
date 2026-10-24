extends GutTest
## HeroesModel against the cards the real `heroCards` builds (data/heroes-fixtures.json), and the skill percentages the cards show.

func _fixtures() -> Dictionary:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/heroes-fixtures.json")), OK)
	return parsed.data

func _state(c: Dictionary) -> Dictionary:
	var marches: Array = []
	if not (c["marching"] as Array).is_empty():
		var ids: Array = c["marching"]
		marches.append({"heroes": {"lead": ids[0], "deputies": ids.slice(1), "levels": {}}})
	return {"levels": {"hero_hall": c["hall"]}, "heroes": {"owned": c["owned"], "pity": 0}, "marches": marches}

func test_every_fixture_card_matches_the_client() -> void:
	var cases: Array = _fixtures()["cases"]
	assert_eq(cases.size(), 42)
	for c: Dictionary in cases:
		var got := HeroesModel.cards(_state(c), c["background"])
		var want: Array = c["cards"]
		assert_eq(got.size(), want.size())
		for i in want.size():
			var label := "%s hall %s %s card %d (%s)" % [c["background"], c["hall"], c["scenario"], i, want[i]["id"]]
			assert_eq(got[i]["id"], want[i]["id"], label + " order")
			assert_eq(got[i]["busy"], want[i]["busy"], label + " busy")
			assert_eq(got[i]["level_up"], want[i]["level_up"] if want[i]["level_up"] != null else "", label + " level up")
			assert_eq(got[i]["next_shards"], int(want[i]["next_shards"]) if want[i]["next_shards"] != null else -1, label + " next shards")
			assert_eq(got[i]["cap"], int(want[i]["cap"]), label + " cap")

func test_skill_percentages_match_the_card_text() -> void:
	var rows: Array = _fixtures()["skill_pcts"]
	assert_eq(rows.size(), 8 * 10)
	for r: Dictionary in rows:
		var card := {"def": Balance.data()["heroes"][r["hero"]], "owned": {"level": int(r["level"]), "shards": 0}}
		var lines := HeroesModel.skill_lines(card)
		assert_eq(lines[0]["pct"], int(r["command"]), "%s level %s command" % [r["hero"], r["level"]])
		for i in (r["passives"] as Array).size():
			assert_eq(lines[i + 1]["pct"], int(r["passives"][i]), "%s level %s passive %d" % [r["hero"], r["level"], i])

func test_an_unknown_background_falls_back_to_the_default() -> void:
	assert_eq(HeroesModel.hero_ids(""), HeroesModel.hero_ids("algeria"))
	assert_ne(HeroesModel.hero_ids("vietnam"), HeroesModel.hero_ids("algeria"))

func test_the_cap_and_the_steps() -> void:
	assert_eq(HeroesModel.level_cap(1), 2)
	assert_eq(HeroesModel.level_cap(5), 10)
	assert_eq(HeroesModel.level_cap(9), 10, "never above the top level")
	assert_eq(HeroesModel.shards_to_next(1), 2)
	assert_eq(HeroesModel.shards_to_next(10), -1)
