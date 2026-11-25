extends GutTest
## MarchSheet in harvest mode: troops and the harvest preview only (no odds, no heroes, no gather time), Send off for a refusal, and the
## harvest sent with the site and the troops.

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

const SITE := {"id": "quarry:0", "kind": "quarry", "level": 1, "x": 13, "y": 14, "occupied": false, "mine": false}

func _state(marches: Array = []) -> Dictionary:
	return {"resources": {}, "levels": {"hero_hall": 2}, "lastUpdated": 1, "troops": {"infantry": 10, "scouts": 4, "heavy": 0, "porters": 3},
		"heroes": {"owned": {"hill_commander": {"level": 1, "shards": 0}}, "pity": 0}, "marches": marches}

func _sheet(state: Dictionary, api := FakeApi.new()) -> Array:
	var session := Session.new(api, Clock.new())
	session.apply({"state": state, "now": 5})
	var sheet: MarchSheet = add_child_autofree(MarchSheet.new())
	sheet.setup(session)
	sheet.open(SITE, Vector2i(10, 10), "harvest")
	return [sheet, session, api]

func _texts(root: Node) -> Array:
	return root.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func _button(root: Node, text: String) -> Button:
	for b: Button in root.find_children("*", "Button", true, false):
		if b.text == text:
			return b
	return null

func _step(root: Node, glyph: String, index: int) -> Button:
	var found: Array = root.find_children("*", "Button", true, false).filter(func(b: Button) -> bool: return b.text == glyph)
	return found[index]

func test_it_shows_the_site_and_no_heroes_or_odds() -> void:
	var sheet: MarchSheet = _sheet(_state())[0]
	assert_true(sheet.is_open())
	assert_eq(sheet._slots.size(), 0, "no hero places")
	var texts := _texts(sheet)
	assert_true(texts.has(Loc.t("march.target", {"name": Loc.t("site.quarry.name"), "level": "1"})))
	assert_false(texts.has(Loc.t("march.heroes")))
	assert_false(texts.has(Loc.t("map.defenders")))

func test_send_is_off_until_a_combat_unit_is_picked() -> void:
	var pair := _sheet(_state())
	var sheet: MarchSheet = pair[0]
	assert_true(_button(sheet, Loc.t("harvest.send")).disabled)
	assert_true(_texts(sheet).has(Loc.t("reason.no_troops")))

func test_picking_troops_shows_the_preview_and_turns_send_on() -> void:
	var sheet: MarchSheet = _sheet(_state())[0]
	_step(sheet, "+", 0).pressed.emit()
	assert_false(_button(sheet, Loc.t("harvest.send")).disabled)
	assert_true(_texts(sheet).has(Fmt.amount(Fmt.lang(), 10)), "the carry of one infantry is 10")

func test_porters_alone_are_refused_before_send() -> void:
	var sheet: MarchSheet = _sheet(_state())[0]
	sheet._set_count("porters", 2)
	assert_true(_button(sheet, Loc.t("harvest.send")).disabled)
	assert_true(_texts(sheet).has(Loc.t("reason.no_troops")))

func test_a_taken_site_is_refused_before_send() -> void:
	var taken := SITE.duplicate()
	taken["occupied"] = true
	var session := Session.new(FakeApi.new(), Clock.new())
	session.apply({"state": _state(), "now": 5})
	var sheet: MarchSheet = add_child_autofree(MarchSheet.new())
	sheet.setup(session)
	sheet.open(taken, Vector2i(10, 10), "harvest")
	sheet._set_count("infantry", 1)
	assert_true(_button(sheet, Loc.t("harvest.send")).disabled)
	assert_true(_texts(sheet).has(Loc.t("reason.site_taken")))

func test_send_posts_the_harvest_and_closes_when_it_is_accepted() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": true, "status": 200, "data": {"ok": true, "state": _state(), "now": 6}}]
	var pair := _sheet(_state(), api)
	var sheet: MarchSheet = pair[0]
	sheet._set_count("infantry", 2)
	var send := _button(sheet, Loc.t("harvest.send"))
	send.pressed.emit()
	await (Engine.get_main_loop() as SceneTree).process_frame
	await (Engine.get_main_loop() as SceneTree).process_frame
	assert_eq(api.posted[0], {"type": "harvest_start", "site": "quarry:0", "troops": {"infantry": 2, "scouts": 0, "heavy": 0, "porters": 0}})
	assert_false(sheet.is_open(), "an accepted harvest closes the sheet")
