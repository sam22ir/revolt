extends GutTest
## HelpModel: `helpable_job` against the golden cases of helpableJob (data/training-fixtures.json), and `can_ask`, which mirrors
## canAskHelp in apps/client/src/ui/app-ui.ts (the closure is not importable, so its cases are written out here).

const FIXTURES := "res://data/training-fixtures.json"

func test_a_job_counts_only_while_it_runs_as_helpable_job_says() -> void:
	var parser := JSON.new()
	assert_eq(parser.parse(FileAccess.get_file_as_string(FIXTURES)), OK)
	var rows: Array = parser.data["helpable"]
	assert_gt(rows.size(), 10)
	for row: Dictionary in rows:
		var got: Variant = HelpModel.helpable_job(row["job"], int(row["now"]))
		var expected: Variant = row["expected"]
		if expected == null:
			assert_null(got, "%s job, now %d" % [row["kind"], int(row["now"])])
		else:
			assert_not_null(got, "%s job, now %d" % [row["kind"], int(row["now"])])
			assert_true(is_equal_approx(float(got["endsAt"]), float(expected["endsAt"])))

func _request(id: String, kind: String, ends_at: float, mine: bool) -> Dictionary:
	return {"id": id, "kind": kind, "endsAt": ends_at, "mine": mine, "helps": 0, "maxHelps": 3, "helped": false, "handle": "x"}

func test_no_alliance_means_no_button() -> void:
	assert_false(HelpModel.can_ask(null, [], "upgrade", 100))

func test_in_an_alliance_with_nothing_open_the_button_shows() -> void:
	assert_true(HelpModel.can_ask({"id": "a"}, [], "upgrade", 100))

func test_an_open_request_of_the_player_hides_the_button_for_that_kind_only() -> void:
	var help := [_request("r1", "upgrade", 500, true)]
	assert_false(HelpModel.can_ask({"id": "a"}, help, "upgrade", 100), "own upgrade request still open")
	assert_true(HelpModel.can_ask({"id": "a"}, help, "training", 100), "the other kind is free")

func test_an_expired_request_of_the_player_does_not_hide_it() -> void:
	var help := [_request("r1", "upgrade", 100, true)]
	assert_true(HelpModel.can_ask({"id": "a"}, help, "upgrade", 100), "ends at now: it is over")

func test_other_members_requests_do_not_hide_the_button() -> void:
	var help := [_request("r2", "upgrade", 500, false)]
	assert_true(HelpModel.can_ask({"id": "a"}, help, "upgrade", 100))

func test_a_request_is_recognised_by_its_fields() -> void:
	assert_true(HelpModel.is_request(_request("r1", "upgrade", 500, true)))
	assert_false(HelpModel.is_request({"id": "r1"}))
	assert_false(HelpModel.is_request("junk"))

func test_a_request_replaces_the_one_with_its_id_or_is_added() -> void:
	var help := [_request("r1", "upgrade", 500, false)]
	var answered := _request("r1", "upgrade", 400, true)
	var out := HelpModel.with_request(help, answered)
	assert_eq(out.size(), 1)
	assert_true(bool(out[0]["mine"]))
	assert_eq(HelpModel.with_request(help, _request("r2", "training", 600, true)).size(), 2)
