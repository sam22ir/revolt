extends GutTest
## TrainingModel against the golden cases written from packages/rules/src/training.ts and troop-format.ts (data/training-fixtures.json).

const FIXTURES := "res://data/training-fixtures.json"

func _fixtures() -> Dictionary:
	var parser := JSON.new()
	assert_eq(parser.parse(FileAccess.get_file_as_string(FIXTURES)), OK, "fixtures parse")
	return parser.data

func after_each() -> void:
	TranslationServer.set_locale("en")

func test_batch_size_per_level_and_maximum_match_the_client() -> void:
	var f := _fixtures()
	assert_eq(int(f["batchPerLevel"]), int(Balance.data()["trainingBatchPerLevel"]))
	for row: Array in f["maxBatch"]:
		assert_eq(TrainingModel.max_batch(int(row[0])), int(row[1]), "barracks %d" % int(row[0]))

func test_quotes_match_the_client() -> void:
	for q: Dictionary in _fixtures()["quotes"]:
		var got := TrainingModel.quote(q["troop"], int(q["count"]))
		assert_true(is_equal_approx(float(got["duration_ms"]), float(q["durationMs"])), "duration %s x%d" % [q["troop"], int(q["count"])])
		for id: String in q["cost"]:
			assert_true(is_equal_approx(float(got["cost"][id]), float(q["cost"][id])), "%s cost %s x%d" % [id, q["troop"], int(q["count"])])

func test_every_check_matches_the_client() -> void:
	var rows: Array = _fixtures()["checks"]
	assert_gt(rows.size(), 100)
	for row: Dictionary in rows:
		var got := TrainingModel.check(int(row["barracks"]), bool(row["busy"]), row["troop"], float(row["count"]), row["resources"])
		assert_eq(got, row["reason"], "%s barracks %d busy %s count %s %s" % [row["troop"], int(row["barracks"]), row["busy"], row["count"], row["scenario"]])

func test_a_barracks_below_the_troop_tier_is_blocked() -> void:
	var rich := {"food": 1e9, "materiel": 1e9, "funds": 1e9, "support": 1e9}
	assert_eq(TrainingModel.check(1, false, "infantry", 1.0, rich, 2), "barracks_level")
	assert_eq(TrainingModel.check(2, false, "infantry", 1.0, rich, 2), "")

func test_the_count_is_rounded_down_and_kept_between_one_and_the_maximum() -> void:
	assert_eq(TrainingModel.clamp_count(7.9, 20), 7)
	assert_eq(TrainingModel.clamp_count(0.0, 20), 1)
	assert_eq(TrainingModel.clamp_count(-5.0, 20), 1)
	assert_eq(TrainingModel.clamp_count(99.0, 20), 20)
	assert_eq(TrainingModel.clamp_count(NAN, 20), 1)
	assert_eq(TrainingModel.clamp_count(INF, 20), 1)
	assert_eq(TrainingModel.clamp_count(5.0, 0), 1, "a barracks with no batch still shows one")

func test_troop_lists_match_the_client_in_english_and_arabic() -> void:
	var f := _fixtures()
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		var expected: Array = f["troopList"][lang]
		for i in (f["troopCases"] as Array).size():
			assert_eq(TrainingModel.troop_list(f["troopCases"][i], lang), expected[i], "%s case %d" % [lang, i])
