extends GutTest
## The server's real answer to a march intent (data/captured-march.json: 30 infantry led by the Mountain guide at a level 1 patrol, sent
## from a camp at 43,54 to a target at 32,53), read through the client's own code.

func _reply() -> Dictionary:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/captured-march.json")), OK)
	return parsed.data

func test_the_client_predicts_the_travel_time_the_server_planned() -> void:
	var m: Dictionary = _reply()["state"]["marches"][0]
	var leg := int(m["arriveAt"]) - int(m["departAt"])
	var got := MarchModel.travel_ms(float(m["from"]["x"]), float(m["from"]["y"]), float(m["target"]["x"]), float(m["target"]["y"]), m["troops"])
	assert_eq(got, leg, "the leg the client shows is the one the server planned")
	assert_eq(int(m["returnAt"]) - int(m["arriveAt"]), leg, "the way back takes the same time")

func test_the_session_takes_the_troops_and_the_march_the_server_sent() -> void:
	var session := Session.new(RefCounted.new(), Clock.new())
	session.apply(_reply())
	assert_eq(int(session.state["troops"]["infantry"]), 76)
	assert_eq((session.state["marches"] as Array).size(), 1)
	assert_eq(MarchModel.busy_ids(session.state), {"mountain_guide": true})
	assert_eq(MarchModel.available_heroes(session.state, "algeria"), ["dock_foreman"], "the lead is out, the other hero is free")

func test_the_slot_and_hero_rules_read_the_same_state() -> void:
	var session := Session.new(RefCounted.new(), Clock.new())
	session.apply(_reply())
	var one := {"infantry": 5, "scouts": 0, "heavy": 0, "porters": 0}
	assert_eq(MarchModel.check(session.state, one, null), "", "one slot is still free")
	assert_eq(MarchModel.check(session.state, one, {"lead": "mountain_guide", "deputies": []}), "hero_busy")
	assert_eq(MarchModel.check(session.state, {"infantry": 77, "scouts": 0, "heavy": 0, "porters": 0}, null), "not_enough_troops")

func _report() -> Dictionary:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/captured-march-report.json")), OK)
	return parsed.data["reports"][0]

func test_the_real_battle_report_belongs_to_that_march_and_arrives_when_planned() -> void:
	var m: Dictionary = _reply()["state"]["marches"][0]
	var report := _report()
	assert_eq(report["id"], m["id"], "a report takes its march's id")
	assert_eq(int(report["at"]), int(m["arriveAt"]), "it is stamped with the arrival time")
	assert_eq(report["sent"], m["troops"])
	assert_eq(report["heroes"], ["mountain_guide"])

func test_the_real_battle_report_reads_through_the_reports_model() -> void:
	var d := ReportsModel.detail(_report())
	assert_eq(d["result"], "victory")
	assert_eq(d["target_kind"], "patrol")
	assert_eq([int(d["x"]), int(d["y"])], [32, 53])
	assert_eq(d["mine"], [{"troop": "infantry", "sent": 30, "survivors": 28, "wounded": 2, "lost": 0}])
	assert_eq(d["theirs"], [{"troop": "infantry", "defenders": 4, "defeated": 4}, {"troop": "scouts", "defenders": 3, "defeated": 3}])
	assert_eq(d["heroes"], ["mountain_guide"])
	assert_eq(d["loot"].size(), 3, "food, materiel and funds; no support")
	var row := ReportsModel.row(_report())
	assert_eq(row["result"], "victory")
