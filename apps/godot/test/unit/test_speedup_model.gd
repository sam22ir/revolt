extends GutTest
## SpeedupModel against the reasons the real `speedUp` gives (data/speedup-fixtures.json), plus what the server leaves out of the
## fixtures: the new UTC day, an unknown wallet, and the row's view.

func _job(c: Dictionary) -> Variant:
	if c["job"] == "none":
		return null
	var ends: int = int(c["now"]) - 1 if c["job"] == "ended" else int(c["now"]) + 7_200_000
	var job := {"endsAt": ends}
	if c["kind"] == "upgrade":
		job["building"] = c["building"]
	return job

func test_every_fixture_matches_the_rules() -> void:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/speedup-fixtures.json")), OK)
	var cases: Array = parsed.data["cases"]
	assert_eq(cases.size(), 54)
	for c: Dictionary in cases:
		var wallet := {"speedupTokens": c["held"], "usedTodayMs": c["used"], "dailyCapMs": c["cap"], "at": c["now"]}
		var got := SpeedupModel.reason(c["kind"], _job(c), wallet, int(c["now"]))
		assert_eq(got, c["reason"], "%s %s %s held=%s used=%s" % [c["kind"], c["job"], c["building"], c["held"], c["used"]])

func test_a_new_utc_day_resets_what_was_used() -> void:
	var cap := 14_400_000
	var wallet := {"speedupTokens": 1, "usedTodayMs": cap, "dailyCapMs": cap, "at": 1_800_000_000_000}
	var job := {"endsAt": 1_800_000_000_000 + 10 * 86_400_000, "building": "farm"}
	assert_eq(SpeedupModel.reason("upgrade", job, wallet, 1_800_000_000_000), "daily_cap")
	var next_day := (1_800_000_000_000 / SpeedupModel.DAY_MS + 1) * SpeedupModel.DAY_MS
	assert_eq(SpeedupModel.reason("upgrade", job, wallet, next_day), "", "after UTC midnight the allowance is whole again")
	assert_eq(SpeedupModel.allowance_ms(wallet, next_day), float(cap))

func test_the_row_is_hidden_while_the_wallet_is_unknown_or_no_job_runs() -> void:
	var job := {"endsAt": 5000, "building": "farm"}
	assert_false(SpeedupModel.view("upgrade", job, {}, 1000)["visible"], "unknown is not zero tokens")
	var wallet := {"speedupTokens": 0, "usedTodayMs": 0, "dailyCapMs": 100, "at": 0}
	assert_false(SpeedupModel.view("upgrade", null, wallet, 1000)["visible"])
	assert_false(SpeedupModel.view("upgrade", job, wallet, 6000)["visible"], "a job that ended is gone")
	var v := SpeedupModel.view("upgrade", job, wallet, 1000)
	assert_true(v["visible"])
	assert_eq(v["reason"], "too_few_tokens")

func test_wallet_shape() -> void:
	assert_true(SpeedupModel.is_wallet({"speedupTokens": 1, "usedTodayMs": 0, "dailyCapMs": 5}))
	assert_false(SpeedupModel.is_wallet({"speedupTokens": 1}))
	assert_false(SpeedupModel.is_wallet(null))
