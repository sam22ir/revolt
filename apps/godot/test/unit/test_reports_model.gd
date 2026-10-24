extends GutTest
## ReportsModel: the merged list (by id, newest first, capped, malformed dropped) and the rows and sections the Reports screen draws.

func _report(id: String, at: float, result := "victory", kind = "patrol", extra := {}) -> Dictionary:
	var r := {
		"id": id,
		"at": at,
		"target": {"kind": kind, "level": 3, "x": 12, "y": 40},
		"result": result,
		"sent": {"infantry": 10, "scouts": 0, "heavy": 2, "porters": 0},
		"survivors": {"infantry": 8, "scouts": 0, "heavy": 2, "porters": 0},
		"wounded": {"infantry": 1, "scouts": 0, "heavy": 0, "porters": 0},
		"lost": {"infantry": 1, "scouts": 0, "heavy": 0, "porters": 0},
		"defenders": {"infantry": 4, "scouts": 0, "heavy": 0, "porters": 0},
		"defendersKilled": {"infantry": 4, "scouts": 0, "heavy": 0, "porters": 0},
		"rounds": 3,
		"loot": {"food": 300, "materiel": 0, "funds": 150, "support": 0},
		"seed": null,
	}
	r.merge(extra, true)
	return r

func _ids(list: Array) -> Array:
	return list.map(func(r: Dictionary) -> String: return r["id"])

func test_merge_is_newest_first_with_ties_by_id() -> void:
	var list := ReportsModel.merged([], [_report("a", 100), _report("c", 300), _report("b", 300)], 20)
	assert_eq(_ids(list), ["c", "b", "a"], "newest first, then the newer id first on a tie")

func test_a_later_copy_of_an_id_wins_and_nothing_is_listed_twice() -> void:
	var old := _report("x", 100, "defeat")
	var newer := _report("x", 100, "victory")
	var list := ReportsModel.merged([old], [newer, _report("y", 50)], 20)
	assert_eq(list.size(), 2)
	assert_eq(list[0]["result"], "victory")

func test_the_cap_keeps_the_newest() -> void:
	var incoming: Array = []
	for i in 25:
		incoming.append(_report("r%02d" % i, float(i)))
	var list := ReportsModel.merged([], incoming, 20)
	assert_eq(list.size(), 20)
	assert_eq(list[0]["id"], "r24")
	assert_eq(list[19]["id"], "r05")

func test_a_malformed_report_is_dropped() -> void:
	var bad := _report("bad", 500)
	bad.erase("loot")
	var list := ReportsModel.merged([], [bad, _report("good", 1), "not a report"], 20)
	assert_eq(_ids(list), ["good"])

func test_row_has_the_result_target_and_time() -> void:
	var row := ReportsModel.row(_report("a", 1234, "defeat", "convoy"))
	assert_eq(row, {"id": "a", "result": "defeat", "target_kind": "convoy", "level": 3, "at": 1234})

func test_a_gone_target_has_no_kind_in_the_row() -> void:
	var row := ReportsModel.row(_report("a", 1, "target_gone", null))
	assert_eq(row["target_kind"], "")

func test_detail_lists_only_the_troops_that_took_part_and_loot_above_zero() -> void:
	var d := ReportsModel.detail(_report("a", 1))
	assert_eq(d["mine"], [{"troop": "infantry", "sent": 10, "survivors": 8, "wounded": 1, "lost": 1}, {"troop": "heavy", "sent": 2, "survivors": 2, "wounded": 0, "lost": 0}])
	assert_eq(d["theirs"], [{"troop": "infantry", "defenders": 4, "defeated": 4}])
	assert_eq(d["loot"], [{"id": "food", "amount": 300}, {"id": "funds", "amount": 150}])
	assert_eq(d["rounds"], 3)
	assert_false(d["gone"])

func test_heroes_show_only_when_the_report_has_them() -> void:
	assert_eq(ReportsModel.detail(_report("a", 1))["heroes"], [])
	var with := _report("b", 1, "victory", "patrol", {"heroes": ["mountain_guide", "trail_scout"]})
	assert_eq(ReportsModel.detail(with)["heroes"], ["mountain_guide", "trail_scout"])
	var empty := _report("c", 1, "victory", "patrol", {"heroes": []})
	assert_eq(ReportsModel.detail(empty)["heroes"], [])

func test_a_gone_target_keeps_only_the_target_and_time() -> void:
	var d := ReportsModel.detail(_report("a", 1, "target_gone", null))
	assert_true(d["gone"])
	assert_eq(d["mine"], [])
	assert_eq(d["theirs"], [])
	assert_eq(d["loot"], [])
	assert_eq(d["target_kind"], "")
