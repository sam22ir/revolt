extends GutTest
## What the mock server really answered to a rally (data/captured-rally-*.json): starting one (60 infantry, gathering one minute, at a
## level 3 outpost 4 tiles away), joining a second one (30 infantry; the rally's leg was 12 min 55 s, not the one from our camp), and the
## report the rally's share came back as (a defeat), all read through the client's own code.

func _load(name: String) -> Dictionary:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/captured-rally-%s.json" % name)), OK)
	return parsed.data

func test_a_started_rally_is_a_gathering_march_that_waits_at_the_camp() -> void:
	var m: Dictionary = _load("start")["state"]["marches"][0]
	var gather_ends := float(m["departAt"])
	assert_ne(m.get("rallyId"), null)
	assert_eq(MarchesModel.stage(m, gather_ends - 1.0), "gathering")
	assert_eq(MarchesModel.stage(m, gather_ends), "outbound")
	var at := MarchesModel.position({"from": m["from"], "to": {"x": m["target"]["x"], "y": m["target"]["y"]}, "departAt": m["departAt"], "arriveAt": m["arriveAt"], "returnAt": m["returnAt"]}, gather_ends - 30000.0)
	assert_eq([at["leg"], at["x"], at["y"]], ["outbound", 43.0, 54.0], "the medallion sits at the camp until it leaves")

func test_the_client_predicts_the_rallys_leg_from_our_camp() -> void:
	var m: Dictionary = _load("start")["state"]["marches"][0]
	var leg := int(m["arriveAt"]) - int(m["departAt"])
	assert_eq(RallyModel.leg_ms(float(m["from"]["x"]), float(m["from"]["y"]), float(m["target"]["x"]), float(m["target"]["y"])), leg)
	assert_eq(int(m["returnAt"]) - int(m["arriveAt"]), leg)

func test_a_joined_rally_takes_the_rallys_times_and_uses_the_second_slot() -> void:
	var session := Session.new(RefCounted.new(), Clock.new())
	session.apply(_load("join"))
	var marches: Array = session.state["marches"]
	assert_eq(marches.size(), 2)
	var joined: Dictionary = marches[1]
	assert_eq(int(joined["troops"]["infantry"]), 30)
	assert_ne(joined["rallyId"], marches[0]["rallyId"])
	var one := {"infantry": 1, "scouts": 0, "heavy": 0, "porters": 0}
	assert_eq(MarchModel.check(session.state, one, null), "too_many_marches", "a rally march takes a slot like any march")
	var leg := int(joined["arriveAt"]) - int(joined["departAt"])
	assert_ne(leg, RallyModel.leg_ms(43.0, 54.0, float(joined["target"]["x"]), float(joined["target"]["y"])), "the rally's leg was planned from its leader's camp, not ours")

func test_the_rally_report_reads_as_the_players_share() -> void:
	var report: Dictionary = _load("report")["reports"][0]
	var d := ReportsModel.detail(report)
	assert_eq([d["result"], d["target_kind"], d["level"]], ["defeat", "outpost", 3])
	assert_eq(d["mine"], [{"troop": "infantry", "sent": 60, "survivors": 0, "wounded": 48, "lost": 12}])
	assert_eq(d["theirs"].size(), 3)
	assert_eq(d["loot"], [], "a defeat takes nothing")
	var m: Dictionary = _load("start")["state"]["marches"][0]
	assert_eq(report["id"], m["id"])
	assert_eq(int(report["at"]), int(m["arriveAt"]))
