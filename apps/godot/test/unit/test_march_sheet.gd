extends GutTest
## MarchSheet: the rows and pickers follow the base, Send is on only for a march the rules allow, a refusal shows under it, and a march
## that left closes the sheet. Runs on a fake Api; the server's verdict is the reply it is given.

class FakeApi:
	extends RefCounted
	var token := "t"
	var posted: Array = []
	var replies: Array = []
	func get_json(_path: String) -> Dictionary:
		await (Engine.get_main_loop() as SceneTree).process_frame
		return {"ok": false, "status": 0, "data": null}
	func post_json(_path: String, body: Variant = {}) -> Dictionary:
		posted.append(body)
		await (Engine.get_main_loop() as SceneTree).process_frame
		return replies.pop_front() if not replies.is_empty() else {"ok": false, "status": 0, "data": null}

const NPC := {"id": "n1", "kind": "patrol", "level": 1, "x": 13, "y": 14, "region": 1}

func _state(marches: Array = []) -> Dictionary:
	return {"resources": {}, "levels": {"hero_hall": 2}, "lastUpdated": 1, "troops": {"infantry": 10, "scouts": 4, "heavy": 0, "porters": 3},
		"heroes": {"owned": {"hill_commander": {"level": 1, "shards": 0}, "dock_foreman": {"level": 2, "shards": 0}}, "pity": 0}, "marches": marches}

func _sheet(state: Dictionary, api := FakeApi.new()) -> Array:
	var session := Session.new(api, Clock.new())
	session.apply({"state": state, "now": 5})
	var sheet: MarchSheet = add_child_autofree(MarchSheet.new())
	sheet.setup(session)
	sheet.open(NPC, Vector2i(10, 10))
	return [sheet, session, api]

func _texts(root: Node) -> Array:
	return root.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func _button(root: Node, text: String) -> Button:
	for b: Button in root.find_children("*", "Button", true, false):
		if b.text == text:
			return b
	return null

func test_it_opens_with_nothing_picked_and_send_off() -> void:
	var pair := _sheet(_state())
	var sheet: MarchSheet = pair[0]
	assert_true(sheet.is_open())
	assert_true(_button(sheet, Loc.t("march.send")).disabled)
	assert_true(_texts(sheet).has(Loc.t("reason.no_troops")), "the first reason is named")
	assert_true(_texts(sheet).has(Loc.t("march.atHome", {"count": "10"})))
	assert_true(_texts(sheet).has("—"), "no travel time without troops")

func test_stepping_a_count_gives_the_travel_time_and_carry_and_turns_send_on() -> void:
	var sheet: MarchSheet = _sheet(_state())[0]
	sheet._set_count("scouts", 2)
	assert_false(_button(sheet, Loc.t("march.send")).disabled)
	var want := Fmt.duration(MarchModel.travel_ms(10, 10, 13, 14, {"infantry": 0, "scouts": 2, "heavy": 0, "porters": 0}))
	assert_true(_texts(sheet).has(want), "5 tiles at 4 a minute")
	assert_true(_texts(sheet).has("10"), "two scouts carry 10")

func test_a_count_never_goes_past_what_is_at_home_or_below_zero() -> void:
	var sheet: MarchSheet = _sheet(_state())[0]
	sheet._set_count("scouts", 99)
	assert_eq(sheet._counts["scouts"], 4)
	sheet._set_count("scouts", -5)
	assert_eq(sheet._counts["scouts"], 0)
	sheet._set_count("infantry", sheet._home("infantry"))
	assert_eq(sheet._counts["infantry"], 10)
	assert_true((sheet._rows["infantry"]["more"] as Button).disabled)

func test_porters_alone_cannot_go() -> void:
	var sheet: MarchSheet = _sheet(_state())[0]
	sheet._set_count("porters", 2)
	assert_true(_button(sheet, Loc.t("march.send")).disabled)
	assert_true(_texts(sheet).has(Loc.t("reason.no_troops")))

func test_all_slots_in_use_turns_send_off_with_that_reason() -> void:
	var sheet: MarchSheet = _sheet(_state([{}, {}]))[0]
	sheet._set_count("scouts", 1)
	assert_true(_button(sheet, Loc.t("march.send")).disabled)
	assert_true(_texts(sheet).has(Loc.t("reason.too_many_marches")))

func test_the_pickers_offer_the_free_heroes_and_a_hero_fills_one_slot() -> void:
	var sheet: MarchSheet = _sheet(_state())[0]
	var lead: OptionButton = sheet._pickers[0]
	assert_eq(lead.item_count, 3, "none and two heroes")
	sheet._on_pick(0, 1)
	var deputy: OptionButton = sheet._pickers[1]
	var picked := String(lead.get_item_metadata(lead.selected))
	var other_index := -1
	for i in deputy.item_count:
		if deputy.get_item_metadata(i) == picked:
			other_index = i
	assert_true(deputy.is_item_disabled(other_index), "already the lead")
	assert_true(_texts(sheet).any(func(t: String) -> bool: return t.begins_with(Loc.t("march.heroBonus", {"attack": "", "defense": ""}).substr(0, 8))), "the bonus line shows")

func test_a_hero_already_out_is_not_offered() -> void:
	var out := {"heroes": {"lead": "hill_commander", "deputies": [], "levels": {}}}
	var sheet: MarchSheet = _sheet(_state([out]))[0]
	assert_eq((sheet._pickers[0] as OptionButton).item_count, 2, "none and the one hero left")

func test_send_posts_the_march_and_closes_the_sheet_when_it_leaves() -> void:
	var api := FakeApi.new()
	var after := _state([{"id": "m1"}])
	after["troops"] = {"infantry": 10, "scouts": 2, "heavy": 0, "porters": 3}
	api.replies = [{"ok": true, "status": 200, "data": {"ok": true, "state": after, "now": 9}}]
	var pair := _sheet(_state(), api)
	var sheet: MarchSheet = pair[0]
	var sent := [0]
	sheet.sent.connect(func() -> void: sent[0] += 1)
	sheet._set_count("scouts", 2)
	sheet._picks[0] = "hill_commander"
	sheet._on_send()
	await wait_until(func() -> bool: return not sheet.is_open(), 5.0)
	assert_eq(sent[0], 1)
	assert_eq(api.posted.size(), 1)
	var body: Dictionary = api.posted[0]
	assert_eq(body["type"], "march")
	assert_eq(body["target"], "n1")
	assert_eq(int(body["troops"]["scouts"]), 2)
	assert_eq(body["heroes"], {"lead": "hill_commander", "deputies": []})
	assert_eq(int((pair[1] as Session).state["troops"]["scouts"]), 2, "the troops at home are the server's")

func test_a_march_without_heroes_sends_null_heroes() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": true, "status": 200, "data": {"ok": true, "state": _state([{}]), "now": 9}}]
	var sheet: MarchSheet = _sheet(_state(), api)[0]
	sheet._set_count("infantry", 1)
	sheet._on_send()
	await wait_until(func() -> bool: return not sheet.is_open(), 5.0)
	assert_null(api.posted[0]["heroes"])

func test_a_refusal_stays_open_and_names_its_reason() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": true, "status": 200, "data": {"ok": false, "reason": "target_gone", "state": _state(), "now": 9}}]
	var sheet: MarchSheet = _sheet(_state(), api)[0]
	sheet._set_count("infantry", 1)
	sheet._on_send()
	await wait_until(func() -> bool: return _texts(sheet).has(Loc.t("reason.target_gone")), 5.0)
	assert_true(sheet.is_open())
	assert_false(_button(sheet, Loc.t("march.send")).disabled, "it can be tried again")
	sheet._set_count("infantry", 2)
	assert_false(_texts(sheet).has(Loc.t("reason.target_gone")), "changing the troops clears the old refusal")

func test_a_reply_that_is_an_error_reads_as_unreachable() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": false, "status": 500, "data": null}]
	var sheet: MarchSheet = _sheet(_state(), api)[0]
	sheet._set_count("infantry", 1)
	sheet._on_send()
	await wait_until(func() -> bool: return _texts(sheet).has(Loc.t("reason.unreachable")), 5.0)
	assert_true(_texts(sheet).has(Loc.t("reason.unreachable")))

func test_a_second_press_while_one_is_out_sends_nothing() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": true, "status": 200, "data": {"ok": true, "state": _state([{}]), "now": 9}}]
	var sheet: MarchSheet = _sheet(_state(), api)[0]
	sheet._set_count("infantry", 1)
	sheet._on_send()
	sheet._on_send()
	await wait_until(func() -> bool: return not sheet.is_open(), 5.0)
	assert_eq(api.posted.size(), 1)

func test_cancel_closes_it() -> void:
	var sheet: MarchSheet = _sheet(_state())[0]
	var closed := [0]
	sheet.closed.connect(func() -> void: closed[0] += 1)
	_button(sheet, Loc.t("march.cancel")).pressed.emit()
	assert_false(sheet.is_open())
	assert_eq(closed[0], 1)

func test_the_troops_at_home_shrinking_pulls_the_count_down() -> void:
	var pair := _sheet(_state())
	var sheet: MarchSheet = pair[0]
	sheet._set_count("infantry", 10)
	var smaller := _state()
	smaller["troops"]["infantry"] = 3
	(pair[1] as Session).apply({"state": smaller, "now": 9})
	assert_eq(sheet._counts["infantry"], 3)

func test_a_number_typed_past_what_is_at_home_reads_as_the_most_at_once() -> void:
	var sheet: MarchSheet = _sheet(_state())[0]
	var field: LineEdit = sheet._rows["infantry"]["field"]
	sheet._typed("infantry", field, "400")
	assert_eq(field.text, "10")
	assert_eq(sheet._counts["infantry"], 10)
	sheet._typed("infantry", field, "3")
	assert_eq(sheet._counts["infantry"], 3)

func _rally_sheet(mode: String, api := FakeApi.new()) -> Array:
	var session := Session.new(api, Clock.new())
	session.apply({"state": _state(), "now": 5})
	var sheet: MarchSheet = add_child_autofree(MarchSheet.new())
	sheet.setup(session)
	var rally := {"id": "r1", "leader": "L", "target": {"npcId": "n1", "kind": "patrol", "level": 1, "x": 13, "y": 14}, "gatherUntil": 60000.0,
		"arriveAt": 90000.0, "returnAt": 120000.0, "participants": 1, "maxParticipants": 5, "joined": false}
	sheet.open(NPC, Vector2i(10, 10), mode, rally if mode == "rally_join" else {})
	return [sheet, session, api]

func test_a_rally_sheet_has_no_heroes_and_names_its_own_title_and_button() -> void:
	var sheet: MarchSheet = _rally_sheet("rally_start")[0]
	assert_eq(sheet._pickers.size(), 0)
	assert_false(_texts(sheet).has(Loc.t("march.heroes")))
	assert_true(_texts(sheet).has(Loc.t("rally.startTitle")))
	assert_true(_texts(sheet).has(Loc.t("rally.gatherTime")))
	assert_not_null(_button(sheet, Loc.t("rally.start")))
	var join: MarchSheet = _rally_sheet("rally_join")[0]
	assert_true(_texts(join).has(Loc.t("rally.joinTitle")))
	assert_not_null(_button(join, Loc.t("rally.join")))
	assert_false(_texts(join).has(Loc.t("rally.gatherTime")))

func test_starting_a_rally_shows_the_fixed_speed_leg_from_your_camp() -> void:
	var sheet: MarchSheet = _rally_sheet("rally_start")[0]
	sheet._set_count("scouts", 1)
	assert_true(_texts(sheet).has(Fmt.duration(float(RallyModel.leg_ms(10, 10, 13, 14)))), "5 tiles at the rally's 2 a minute, whatever the troops")
	sheet._set_count("scouts", 0)
	sheet._set_count("infantry", 3)
	assert_true(_texts(sheet).has(Fmt.duration(float(RallyModel.leg_ms(10, 10, 13, 14)))))

func test_joining_shows_the_rallys_own_leg() -> void:
	var sheet: MarchSheet = _rally_sheet("rally_join")[0]
	sheet._set_count("infantry", 2)
	assert_true(_texts(sheet).has(Fmt.duration(30000.0)), "the rally leaves at 60 s and arrives at 90 s")

func test_start_rally_sends_the_target_troops_and_the_gathering_time() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": true, "status": 200, "data": {"ok": true, "state": _state([{}]), "now": 9}}]
	var sheet: MarchSheet = _rally_sheet("rally_start", api)[0]
	sheet._gather_picker.select(1)
	sheet._gather_picker.item_selected.emit(1)
	sheet._set_count("infantry", 4)
	sheet._on_send()
	await wait_until(func() -> bool: return not sheet.is_open(), 5.0)
	var body: Dictionary = api.posted[0]
	assert_eq([body["type"], body["target"], int(body["troops"]["infantry"]), body["gather"]], ["rally_start", "n1", 4, 300000])
	assert_true(body["gather"] is int, "a whole number, as the server compares it exactly")
	assert_false(body.has("heroes"))

func test_join_rally_sends_the_rally_and_the_troops_and_a_refusal_names_its_reason() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": true, "status": 200, "data": {"ok": false, "reason": "rally_closed", "state": _state(), "now": 9}}]
	var sheet: MarchSheet = _rally_sheet("rally_join", api)[0]
	sheet._set_count("infantry", 2)
	sheet._on_send()
	await wait_until(func() -> bool: return _texts(sheet).has(Loc.t("reason.rally_closed")), 5.0)
	var body: Dictionary = api.posted[0]
	assert_eq([body["type"], body["rally"], int(body["troops"]["infantry"])], ["rally_join", "r1", 2])
	assert_true(sheet.is_open())
