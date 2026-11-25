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

## The tiles on the grid, in order.
func _tiles(screen: HeroesScreen) -> Array:
	return screen.body.find_children("*", "PanelContainer", true, false).filter(func(n: Node) -> bool: return n is HeroTile)

func _labels(root: Node) -> Array:
	return root.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func _tap(on: Control) -> void:
	var at := on.get_global_rect().get_center()
	for down in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = down
		event.position = at
		event.global_position = at
		get_viewport().push_input(event, true)
		await wait_process_frames(2)

func _sized(screen: HeroesScreen, height := 1770.0) -> void:
	screen.set_anchors_preset(Control.PRESET_TOP_LEFT)
	screen.size = Vector2(1080, height)
	await wait_process_frames(3)

func after_each() -> void:
	TranslationServer.set_locale("en")

func _buttons(root: Node, text: String) -> Array:
	return root.find_children("*", "Button", true, false).filter(func(b: Button) -> bool: return b.text == text)

func test_every_hero_of_the_background_has_a_card_and_the_owned_ones_come_first() -> void:
	var pair := _screen(_state(2, {"hill_commander": {"level": 1, "shards": 0}}))
	var screen: HeroesScreen = pair[0]
	var tiles := _tiles(screen)
	assert_eq(tiles.size(), 4)
	assert_eq((tiles[0] as HeroTile).hero, "hill_commander", "the recruited hero is first")
	assert_has(_labels(tiles[0]), Loc.t("hero.hill_commander.name"))
	assert_has(_labels(tiles[1]), Loc.t("heroes.notRecruited"))

func test_level_up_is_on_with_enough_shards_and_off_with_the_reason_otherwise() -> void:
	var enough := _screen(_state(2, {"hill_commander": {"level": 1, "shards": 2}}))
	(enough[0] as HeroesScreen).open_hero("hill_commander")
	var b: Button = _buttons(enough[0], Loc.t("heroes.levelUp"))[0]
	assert_false(b.disabled)
	var short := _screen(_state(2, {"hill_commander": {"level": 1, "shards": 1}}))
	(short[0] as HeroesScreen).open_hero("hill_commander")
	assert_true((_buttons(short[0], Loc.t("heroes.levelUp"))[0] as Button).disabled)
	var texts := (short[0] as HeroesScreen)._body.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)
	assert_true(texts.has(Loc.t("reason.not_enough_shards")))
	var capped := _screen(_state(1, {"hill_commander": {"level": 2, "shards": 50}}))
	(capped[0] as HeroesScreen).open_hero("hill_commander")
	var capped_texts := (capped[0] as HeroesScreen)._body.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)
	assert_true(capped_texts.has(Loc.t("reason.hall_cap", {"cap": 2})), "the hall's cap is named")

func test_a_maxed_hero_has_no_button() -> void:
	var pair := _screen(_state(5, {"hill_commander": {"level": 10, "shards": 0}}))
	(pair[0] as HeroesScreen).open_hero("hill_commander")
	assert_has(_texts(pair[0]), Loc.t("heroes.maxed"))
	assert_eq(_buttons(pair[0], Loc.t("heroes.levelUp")).size(), 0)

func test_pressing_level_up_sends_the_intent_and_a_refusal_is_shown_under_the_card() -> void:
	var api := FakeApi.new()
	var refused := {"ok": true, "status": 200, "data": {"ok": false, "reason": "not_enough_shards", "state": _state(2, {"hill_commander": {"level": 1, "shards": 2}}), "now": 6}}
	api.replies = [refused]
	var pair := _screen(_state(2, {"hill_commander": {"level": 1, "shards": 2}}), api)
	var screen: HeroesScreen = pair[0]
	screen.open_hero("hill_commander")
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

func test_back_goes_from_a_hero_to_the_grid_and_then_out() -> void:
	var pair := _screen(_state(2, {}))
	var screen: HeroesScreen = pair[0]
	watch_signals(screen)
	screen.open_hero("dock_foreman")
	assert_eq(screen.title_text(), Loc.t("hero.dock_foreman.name"))
	screen.back_button().pressed.emit()
	assert_signal_not_emitted(screen, "closed")
	assert_false(screen.is_hero_open())
	assert_eq(screen.title_text(), Loc.t("heroes.title"))
	screen.back_button().pressed.emit()
	assert_signal_emitted(screen, "closed")

func test_the_page_opens_on_the_grid_again() -> void:
	var screen: HeroesScreen = _screen(_state(2, {}))[0]
	screen.open_hero("dock_foreman")
	screen.visible = false
	screen.visible = true
	assert_false(screen.is_hero_open())
	assert_eq(_tiles(screen).size(), 4)

func test_a_tap_on_a_tile_opens_that_hero() -> void:
	var screen: HeroesScreen = _screen(_state(2, {"hill_commander": {"level": 1, "shards": 2}}))[0]
	await _sized(screen)
	await _tap(_tiles(screen)[1])
	assert_true(screen.is_hero_open())
	assert_eq(screen.title_text(), Loc.t("hero.%s.name" % HeroesModel.cards(screen._session.state, screen._session.background)[1]["id"]))
	var id := screen._open
	assert_has(_texts(screen), Loc.t("hero.%s.desc" % id), "what they are inspired by is always shown")
	assert_has(_texts(screen), Loc.t("heroes.notRecruited"))
	assert_eq(_buttons(screen, Loc.t("heroes.levelUp")).size(), 0)

func test_level_up_takes_a_real_tap_and_stays_on_the_hero() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": true, "status": 200, "data": {"ok": true, "state": _state(2, {"hill_commander": {"level": 2, "shards": 0}}), "now": 6}}]
	var screen: HeroesScreen = _screen(_state(2, {"hill_commander": {"level": 1, "shards": 2}}), api)[0]
	screen.open_hero("hill_commander")
	await _sized(screen)
	await _tap(_buttons(screen, Loc.t("heroes.levelUp"))[0])
	await wait_until(func() -> bool: return _texts(screen).has(Loc.t("heroes.level", {"level": 2})), 5.0)
	assert_eq(api.posted, [{"type": "hero_level", "hero": "hill_commander"}])
	assert_eq(screen._open, "hill_commander")

func test_a_drag_on_a_tile_scrolls_the_page_and_back_returns_there() -> void:
	var screen: HeroesScreen = _screen(_state(2, {}))[0]
	await _sized(screen, 1400.0)
	Input.emulate_touch_from_mouse = true
	var from := (_tiles(screen)[0] as Control).get_global_rect().position + Vector2(200, 40)
	for step in 8:
		var event: InputEventMouse = InputEventMouseButton.new() if step == 0 else InputEventMouseMotion.new()
		event.position = from - Vector2(0, 30.0 * step)
		event.global_position = event.position
		event.button_mask = MOUSE_BUTTON_MASK_LEFT
		if step == 0:
			event.button_index = MOUSE_BUTTON_LEFT
			event.pressed = true
		else:
			event.relative = Vector2(0, -30)
			event.screen_relative = event.relative
		get_viewport().push_input(event, true)
		await wait_process_frames(1)
	var up := InputEventMouseButton.new()
	up.button_index = MOUSE_BUTTON_LEFT
	up.position = from - Vector2(0, 210)
	up.global_position = up.position
	get_viewport().push_input(up, true)
	Input.emulate_touch_from_mouse = false
	await wait_process_frames(2)
	assert_gt(screen.scroll.scroll_vertical, 0)
	assert_false(screen.is_hero_open(), "a drag is not a tap")
	await wait_seconds(1.2)
	var at := screen.scroll.scroll_vertical
	screen.open_hero("dock_foreman")
	await wait_process_frames(3)
	assert_eq(screen.scroll.scroll_vertical, 0)
	screen.back_button().pressed.emit()
	await wait_process_frames(6)
	assert_eq(screen.scroll.scroll_vertical, at)

func test_every_view_fits_the_width_of_a_phone() -> void:
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		var state := _state(2, {"hill_commander": {"level": 1, "shards": 2}, "iron_quartermaster": {"level": 4, "shards": 2}})
		state["marches"] = [{"heroes": {"lead": "hill_commander", "deputies": [], "levels": {}}}]
		var screen: HeroesScreen = _screen(state)[0]
		await _sized(screen)
		var room := 1080.0 - 2.0 * HudTheme.px(PageBackdrop.MARGIN - 2.0)
		screen._recruit_note = {"kind": "drawn", "heroId": "iron_quartermaster", "duplicate": true}
		screen.refresh()
		assert_lte(screen.body.get_combined_minimum_size().x, room, lang + " grid")
		for id: String in ["hill_commander", "iron_quartermaster", "dock_foreman"]:
			screen.open_hero(id)
			assert_lte(screen.body.get_combined_minimum_size().x, room, "%s %s" % [lang, id])

func test_every_hero_of_every_background_has_a_portrait_and_its_rarity_reads_on_its_badge() -> void:
	for id: String in Balance.data()["heroes"]:
		assert_has(HudIcon.NAMES, "hero_" + id)
		assert_not_null(HudIcon.load_texture("hero_" + id), id)
		assert_true(HeroPortrait.FRAMES.has(Balance.data()["heroes"][id]["rarity"]))
	for rarity: String in HeroPortrait.BADGES:
		assert_gt((_luminance(HudTheme.BUTTON_TEXT) + 0.05) / (_luminance(HeroPortrait.BADGES[rarity]) + 0.05), 4.5, rarity)

func _luminance(c: Color) -> float:
	var l := c.srgb_to_linear()
	return 0.2126 * l.r + 0.7152 * l.g + 0.0722 * l.b

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
