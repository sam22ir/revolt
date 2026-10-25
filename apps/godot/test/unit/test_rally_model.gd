extends GutTest
## RallyModel against the rules the real client has (data/rallies-fixtures.json), and the small helpers around them.

func _fixtures() -> Dictionary:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/rallies-fixtures.json")), OK)
	return parsed.data

func test_joining_matches_the_client_at_every_moment() -> void:
	var rows: Array = _fixtures()["joins"]
	assert_eq(rows.size(), 36)
	var seen := {}
	for r: Dictionary in rows:
		seen[r["can_join"]] = true
		assert_eq(RallyModel.can_join(r["rally"], float(r["now"])), r["can_join"], "%s at %s" % [r["name"], r["now"]])
	assert_eq(seen.size(), 2, "both answers are covered")

func test_the_leg_matches_the_client() -> void:
	var rows: Array = _fixtures()["legs"]
	assert_eq(rows.size(), 6)
	for r: Dictionary in rows:
		assert_eq(RallyModel.leg_ms(float(r["from"]["x"]), float(r["from"]["y"]), float(r["to"]["x"]), float(r["to"]["y"])), int(r["leg_ms"]), "%s -> %s" % [r["from"], r["to"]])

func test_only_the_ranks_the_rules_name_may_start_a_rally() -> void:
	assert_true(RallyModel.can_start("leader"))
	assert_true(RallyModel.can_start("officer"))
	assert_false(RallyModel.can_start("member"))
	assert_false(RallyModel.can_start(""))

func test_the_gathering_times_are_the_published_ones() -> void:
	assert_eq(RallyModel.gather_options(), [60000.0, 300000.0, 900000.0])

func _rally(id: String, npc: String, extra := {}) -> Dictionary:
	var r := {"id": id, "leader": "L", "target": {"npcId": npc, "kind": "patrol", "level": 1, "x": 5, "y": 6}, "gatherUntil": 1000.0, "arriveAt": 2000.0,
		"returnAt": 3000.0, "participants": 1, "maxParticipants": 5, "joined": false}
	r.merge(extra, true)
	return r

func test_open_rallies_at_a_target_are_those_still_joinable() -> void:
	var list := [_rally("a", "n1"), _rally("b", "n2"), _rally("c", "n1", {"joined": true}), _rally("d", "n1", {"gatherUntil": 400.0}), _rally("e", "n1", {"participants": 5})]
	var open := RallyModel.open_at(list, "n1", 500.0)
	assert_eq(open.map(func(r: Dictionary) -> String: return r["id"]), ["a"])

func test_a_rows_key_changes_when_the_gathering_ends_or_the_count_moves() -> void:
	var r := _rally("a", "n1")
	var before := RallyModel.row_key(r, 999.0)
	assert_ne(RallyModel.row_key(r, 1000.0), before)
	assert_ne(RallyModel.row_key(_rally("a", "n1", {"participants": 2}), 999.0), before)
	assert_eq(RallyModel.row_key(r, 500.0), before, "ticking inside the gathering changes nothing")

func test_a_rallys_target_reads_as_a_march_target() -> void:
	assert_eq(RallyModel.npc_of(_rally("a", "n1")), {"id": "n1", "kind": "patrol", "level": 1, "x": 5, "y": 6, "region": null})
