extends GutTest
## HeroesScreen: one card per hero of the background (owned first), Level up only while allowed, the refusal's reason, and no
## drawing while hidden.

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

func _state(hall: int, owned: Dictionary) -> Dictionary:
	return {"resources": {}, "levels": {"hero_hall": hall}, "lastUpdated": 1, "heroes": {"owned": owned, "pity": 0}, "marches": []}

func _screen(state: Dictionary, api := FakeApi.new()) -> Array:
	var session := Session.new(api, Clock.new())
	session.apply({"state": state, "now": 5})
	var screen: HeroesScreen = add_child_autofree(HeroesScreen.new())
	screen.setup(session)
	screen.refresh()
	return [screen, session, api]

func _buttons(root: Node, text: String) -> Array:
	return root.find_children("*", "Button", true, false).filter(func(b: Button) -> bool: return b.text == text)

func test_every_hero_of_the_background_has_a_card_and_the_owned_ones_come_first() -> void:
	var pair := _screen(_state(2, {"hill_commander": {"level": 1, "shards": 0}}))
	var screen: HeroesScreen = pair[0]
	var cards := screen._body.get_children().filter(func(n: Node) -> bool: return n is PanelContainer)
	assert_eq(cards.size(), 4)
	var first: Label = cards[0].find_children("*", "Label", true, false)[0]
	assert_eq(first.text, Loc.t("hero.hill_commander.name"), "the recruited hero is first")

func test_level_up_is_on_with_enough_shards_and_off_with_the_reason_otherwise() -> void:
	var enough := _screen(_state(2, {"hill_commander": {"level": 1, "shards": 2}}))
	var b: Button = _buttons(enough[0], Loc.t("heroes.levelUp"))[0]
	assert_false(b.disabled)
	var short := _screen(_state(2, {"hill_commander": {"level": 1, "shards": 1}}))
	assert_true((_buttons(short[0], Loc.t("heroes.levelUp"))[0] as Button).disabled)
	var texts := (short[0] as HeroesScreen)._body.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)
	assert_true(texts.has(Loc.t("reason.not_enough_shards")))
	var capped := _screen(_state(1, {"hill_commander": {"level": 2, "shards": 50}}))
	var capped_texts := (capped[0] as HeroesScreen)._body.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)
	assert_true(capped_texts.has(Loc.t("reason.hall_cap", {"cap": 2})), "the hall's cap is named")

func test_a_maxed_hero_has_no_button() -> void:
	var pair := _screen(_state(5, {"hill_commander": {"level": 10, "shards": 0}}))
	assert_eq(_buttons(pair[0], Loc.t("heroes.levelUp")).size(), 0)

func test_pressing_level_up_sends_the_intent_and_a_refusal_is_shown_under_the_card() -> void:
	var api := FakeApi.new()
	var refused := {"ok": true, "status": 200, "data": {"ok": false, "reason": "not_enough_shards", "state": _state(2, {"hill_commander": {"level": 1, "shards": 2}}), "now": 6}}
	api.replies = [refused]
	var pair := _screen(_state(2, {"hill_commander": {"level": 1, "shards": 2}}), api)
	var screen: HeroesScreen = pair[0]
	(_buttons(screen, Loc.t("heroes.levelUp"))[0] as Button).pressed.emit()
	await wait_frames(4)
	assert_eq(api.posted, [{"type": "hero_level", "hero": "hill_commander"}])
	var texts := screen._body.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)
	assert_true(texts.has(Loc.t("reason.not_enough_shards")), "the server's refusal is shown")

func test_a_hidden_screen_draws_nothing() -> void:
	var session := Session.new(FakeApi.new(), Clock.new())
	session.apply({"state": _state(2, {}), "now": 5})
	var screen: HeroesScreen = add_child_autofree(HeroesScreen.new())
	screen.visible = false
	screen.setup(session)
	session.apply({"state": _state(3, {}), "now": 6})
	assert_eq(screen._body.get_child_count(), 0)
	screen.visible = true
	assert_gt(screen._body.get_child_count(), 0, "drawn when shown")

func test_close_is_announced() -> void:
	var pair := _screen(_state(2, {}))
	watch_signals(pair[0])
	(_buttons(pair[0], Loc.t("panel.close"))[0] as Button).pressed.emit()
	assert_signal_emitted(pair[0], "closed")
