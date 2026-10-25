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
	await wait_until(func() -> bool: return _label_texts(screen).has(Loc.t("reason.not_enough_shards")), 5.0)
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

func _label_texts(screen: HeroesScreen) -> Array:
	return screen._body.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func _texts(screen: HeroesScreen) -> Array:
	return screen._body.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func test_the_odds_and_the_pity_line_show_with_the_data_not_hard_coded() -> void:
	var pair := _screen(_state(2, {}))
	var screen: HeroesScreen = pair[0]
	screen.tick({"funds": 500.0})
	var texts := _texts(screen)
	assert_true(texts.has(Loc.t("heroes.odds", {"common": "70", "rare": "22", "legendary": "8"})))
	assert_true(texts.has(Loc.t("heroes.pity", {"count": "10", "left": "10"})))
	pair[1].apply({"state": {"resources": {}, "levels": {"hero_hall": 2}, "lastUpdated": 9, "heroes": {"owned": {}, "pity": 7}, "marches": []}, "now": 9})
	screen.tick({"funds": 500.0})
	assert_true(_texts(screen).has(Loc.t("heroes.pity", {"count": "10", "left": "3"})), "the draws left follow the counter")

func test_recruit_is_off_with_its_reason_below_the_hall_gate_or_without_funds() -> void:
	var low_hall := _screen(_state(1, {}))
	(low_hall[0] as HeroesScreen).tick({"funds": 500.0})
	assert_true((_buttons(low_hall[0], Loc.t("heroes.recruit"))[0] as Button).disabled)
	assert_true(_texts(low_hall[0]).has(Loc.t("reason.hero_hall_level", {"level": 2})))
	var poor := _screen(_state(2, {}))
	(poor[0] as HeroesScreen).tick({"funds": 100.0})
	assert_true((_buttons(poor[0], Loc.t("heroes.recruit"))[0] as Button).disabled)
	assert_true(_texts(poor[0]).has(Loc.t("reason.insufficient", {"level": 2})))
	(poor[0] as HeroesScreen).tick({"funds": 300.0})
	assert_false((_buttons(poor[0], Loc.t("heroes.recruit"))[0] as Button).disabled, "on as the funds grow")

func test_a_draw_shows_who_joined_and_a_duplicate_says_so() -> void:
	var api := FakeApi.new()
	var drawn := _state(2, {"dock_foreman": {"level": 1, "shards": 0}})
	api.replies = [{"ok": true, "status": 200, "data": {"ok": true, "state": drawn, "now": 6, "draw": {"heroId": "dock_foreman", "rarity": "common", "duplicate": false, "forced": false}}},
		{"ok": true, "status": 200, "data": {"ok": true, "state": drawn, "now": 7, "draw": {"heroId": "dock_foreman", "rarity": "common", "duplicate": true, "forced": false}}}]
	var pair := _screen(_state(2, {}), api)
	var screen: HeroesScreen = pair[0]
	screen.tick({"funds": 900.0})
	var joined := Loc.t("heroes.drawn", {"name": Loc.t("hero.dock_foreman.name")})
	var again := Loc.t("heroes.drawnDuplicate", {"name": Loc.t("hero.dock_foreman.name")})
	(_buttons(screen, Loc.t("heroes.recruit"))[0] as Button).pressed.emit()
	await wait_until(func() -> bool: return _texts(screen).has(joined), 5.0)
	assert_eq(api.posted, [{"type": "recruit"}])
	(_buttons(screen, Loc.t("heroes.recruit"))[0] as Button).pressed.emit()
	await wait_until(func() -> bool: return _texts(screen).has(again), 5.0)
	assert_true(_texts(screen).has(again))

func test_a_refused_draw_shows_the_servers_reason() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": true, "status": 200, "data": {"ok": false, "reason": "insufficient", "state": _state(2, {}), "now": 6}}]
	var pair := _screen(_state(2, {}), api)
	var screen: HeroesScreen = pair[0]
	screen.tick({"funds": 900.0})
	(_buttons(screen, Loc.t("heroes.recruit"))[0] as Button).pressed.emit()
	var refusal := Loc.t("reason.insufficient", {"level": 2})
	await wait_until(func() -> bool: return _texts(screen).has(refusal), 5.0)
	assert_true(_texts(screen).has(refusal))

func test_the_odds_and_pity_copy_exists_in_english_and_arabic_with_nothing_left_unfilled() -> void:
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		for key in ["heroes.odds", "heroes.pity"]:
			var text := Loc.t(key, {"common": "70", "rare": "22", "legendary": "8", "count": "10", "left": "4"})
			assert_ne(text, key, "%s has a %s text" % [key, lang])
			assert_false(text.contains("{"), "%s (%s) leaves nothing unfilled: %s" % [key, lang, text])
	TranslationServer.set_locale("en")
