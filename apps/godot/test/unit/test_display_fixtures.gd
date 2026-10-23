extends GutTest
## The display math must reproduce the real TypeScript rules (golden cases from `pnpm godot:export`).

const FIXTURES := "res://data/display-fixtures.json"

func _cases() -> Array:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(FIXTURES))
	assert_true(parsed is Dictionary, "fixtures missing")
	return parsed["cases"]

func test_there_are_fixtures() -> void:
	assert_gt(_cases().size(), 5)

func test_rate_and_cap_match_the_rules() -> void:
	for c: Dictionary in _cases():
		var levels: Dictionary = c["levels"]
		var rate := Balance.production_per_hour(levels)
		var cap := Balance.storage_cap(int(levels["hq"]))
		for id: String in rate:
			assert_almost_eq(rate[id], float(c["ratePerHour"][id]), 1e-9, "%s rate %s" % [c["name"], id])
			assert_almost_eq(float(cap[id]), float(c["cap"][id]), 1e-9, "%s cap %s" % [c["name"], id])

func test_accrual_matches_the_rules() -> void:
	for c: Dictionary in _cases():
		var got := ResourceDisplay.amounts(c["resources"], c["levels"], int(c["lastUpdated"]), int(c["now"]))
		for id: String in c["expected"]:
			assert_almost_eq(got[id], float(c["expected"][id]), 1e-6, "%s %s" % [c["name"], id])
