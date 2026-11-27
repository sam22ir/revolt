extends GutTest
## Missions: the model over the server's MissionsView, the Session's fetch and claims (against a fake Api), and the page.

class FakeApi:
	extends RefCounted
	var token := "t"
	var calls: Array[String] = []
	var posted: Array = []
	var replies: Array = []
	func get_json(path: String) -> Dictionary:
		calls.append(path)
		await (Engine.get_main_loop() as SceneTree).process_frame
		return replies.pop_front() if not replies.is_empty() else {"ok": false, "status": 0, "data": null}
	func post_json(path: String, body: Variant = {}) -> Dictionary:
		calls.append(path)
		posted.append(body)
		await (Engine.get_main_loop() as SceneTree).process_frame
		return replies.pop_front() if not replies.is_empty() else {"ok": false, "status": 0, "data": null}

func _ok(data: Dictionary) -> Dictionary:
	return {"ok": true, "status": 200, "data": data}

func _mission(id: String, progress: int, target: int, done := false, claimed := false) -> Dictionary:
	return {"id": id, "metric": "m", "target": target, "progress": progress, "done": done, "claimed": claimed, "reward": {"resources": {"food": 200, "materiel": 0, "funds": 300}}, "passXp": 30}

func _view(quest: Variant = null, daily: Array = []) -> Dictionary:
	return {"day": 5, "resetsAt": 1000 + 3 * 3600000, "daily": daily, "quest": quest, "now": 1000}

func _quest(done := false) -> Dictionary:
	return {"id": "first_farm", "goal": {"kind": "building_level", "building": "farm", "level": 2}, "progress": 2 if done else 1, "target": 2, "done": done, "reward": {"speedupTokens": 2}, "step": 1, "steps": 10}

func after_each() -> void:
	TranslationServer.set_locale("en")
	Loc.background_id = ""

func test_the_view_shape_check() -> void:
	assert_true(MissionsModel.is_view(_view()))
	assert_true(MissionsModel.is_view(_view(_quest())))
	assert_false(MissionsModel.is_view({}))
	assert_false(MissionsModel.is_view({"daily": "x", "now": 1}))
	assert_false(MissionsModel.is_view({"daily": [], "now": 1, "quest": 5}))
	assert_false(MissionsModel.is_view(null))

func test_rows_cap_progress_and_say_their_state() -> void:
	var rows := MissionsModel.daily_rows(_view(null, [_mission("daily_build", 1, 2), _mission("daily_fight", 9, 3, true), _mission("daily_help", 3, 3, true, true)]))
	assert_eq(rows.map(func(r: Dictionary) -> String: return r["state"]), ["progress", "claim", "claimed"])
	assert_eq(rows[1]["progress"], 3, "capped at the target")
	assert_almost_eq(float(rows[0]["fraction"]), 0.5, 0.001)
	assert_eq(rows[0]["key"], "mission.daily_build")
	assert_eq(rows[0]["vars"], {"count": 2})

func test_the_quest_row_names_its_building_and_its_step() -> void:
	var r := MissionsModel.quest_row(_view(_quest(true)))
	assert_eq(r["key"], "quest.first_farm")
	assert_eq(r["vars"], {"count": 2, "building": "farm"})
	assert_eq([r["state"], r["step"], r["steps"]], ["claim", 1, 10])
	assert_eq(MissionsModel.quest_row(_view(null)), {}, "a finished chain has no row")

func test_claimable_counts_done_missions_and_a_done_quest() -> void:
	assert_eq(MissionsModel.claimable({}), 0)
	assert_eq(MissionsModel.claimable(_view(_quest(false), [_mission("a", 1, 2)])), 0)
	assert_eq(MissionsModel.claimable(_view(_quest(true), [_mission("a", 2, 2, true), _mission("b", 2, 2, true, true)])), 2)

func test_reward_items_come_in_a_fixed_order_and_skip_zeros() -> void:
	var items := MissionsModel.reward_items({"resources": {"funds": 300, "food": 200, "materiel": 0}, "shards": 1, "speedupTokens": 2}, 40)
	assert_eq(items.map(func(i: Dictionary) -> String: return "%s:%s:%d" % [i["kind"], i["id"], i["amount"]]), ["resource:food:200", "resource:funds:300", "shards:heroes:1", "tokens:clock:2", "pass_xp:power:40"])
	assert_eq(MissionsModel.reward_items(null), [])

func test_reset_in_never_goes_below_zero() -> void:
	assert_eq(MissionsModel.reset_in(_view(), 1000), 3 * 3600000)
	assert_eq(MissionsModel.reset_in(_view(), 1000 + 4 * 3600000), 0)
	assert_eq(MissionsModel.reset_in({}, 5), 0)

func test_the_session_fetches_the_view_and_keeps_it_when_a_fetch_fails() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	watch_signals(s)
	api.replies = [_ok(_view(_quest()))]
	await s.load_missions()
	assert_eq(s.missions["quest"]["id"], "first_farm")
	assert_signal_emitted(s, "missions_changed")
	api.replies = [{"ok": false, "status": 0, "data": null}]
	await s.load_missions()
	assert_eq(s.missions["quest"]["id"], "first_farm", "a failed fetch keeps what is held")

func test_a_claim_posts_once_takes_the_base_and_fetches_again() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [_ok({"ok": true, "state": {"resources": {}, "levels": {"hq": 1}, "lastUpdated": 1}, "now": 10}), _ok(_view(null))]
	s.call("claim_mission", "daily", "daily_build")
	assert_eq(await s.claim_mission("daily", "daily_build"), {"ok": false, "reason": ""}, "a second press while one is out sends nothing")
	await wait_until(func() -> bool: return api.calls.size() >= 2, 5.0)
	assert_eq(api.calls, ["/v1/missions/claim", "/v1/missions"] as Array[String])
	assert_eq(api.posted[0], {"mission": "daily_build"})
	assert_true(s.state.has("levels"))

func test_a_quest_claim_goes_to_its_path_and_a_refusal_returns_its_reason() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [_ok({"ok": false, "reason": "not_current", "now": 10}), _ok(_view(_quest()))]
	assert_eq(await s.claim_mission("quest", "first_armory"), {"ok": false, "reason": "not_current"})
	assert_eq(api.calls[0], "/v1/quests/claim")
	assert_eq(api.posted[0], {"quest": "first_armory"})
	api.replies = []
	assert_eq(await s.claim_mission("quest", "first_farm"), {"ok": false, "reason": "unreachable"})

func _texts(root: Node) -> Array:
	return root.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func _buttons(root: Node) -> Array:
	return root.find_children("*", "Button", true, false).filter(func(b: Button) -> bool: return b.text == Loc.t("missions.claim"))

func test_the_page_shows_the_quest_and_the_day_with_claim_buttons_only_for_done_ones() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	var screen: MissionsScreen = add_child_autofree(MissionsScreen.new())
	screen.setup(s)
	assert_has(_texts(screen), Loc.t("missions.loading"))
	s.missions = _view(_quest(true), [_mission("daily_build", 1, 2), _mission("daily_fight", 3, 3, true), _mission("daily_help", 3, 3, true, true)])
	s.missions_changed.emit()
	var texts := _texts(screen)
	assert_has(texts, Loc.t("quest.first_farm", {"building": Loc.t("building.farm.name"), "count": "2"}))
	assert_has(texts, Loc.t("missions.step", {"step": "1", "steps": "10"}))
	assert_has(texts, Loc.t("mission.daily_build", {"count": "2"}))
	assert_has(texts, Loc.t("missions.claimed"))
	var buttons := _buttons(screen)
	assert_eq(buttons.size(), 2, "the done quest and the done, unclaimed mission; an unfinished one has no button")
	assert_eq(buttons.map(func(b: Button) -> bool: return b.disabled), [false, false])

func test_a_vietnam_player_reads_their_own_building_name_and_arabic_works() -> void:
	var s := Session.new(FakeApi.new(), Clock.new())
	var screen: MissionsScreen = add_child_autofree(MissionsScreen.new())
	screen.setup(s)
	Loc.background_id = "vietnam"
	s.missions = _view(_quest())
	s.missions_changed.emit()
	assert_has(_texts(screen), Loc.t("quest.first_farm", {"building": Loc.t("building.farm.name"), "count": "2"}))
	assert_ne(Loc.t("building.farm.name"), Loc.t("building.farm.name", {}, "algeria"), "the paddies, not the farm")
	TranslationServer.set_locale("ar")
	screen.refresh()
	assert_has(_texts(screen), Loc.t("missions.quests"))
	assert_ne(Loc.t("missions.quests"), "missions.quests", "the Arabic key exists")

func test_a_finished_chain_says_so() -> void:
	var s := Session.new(FakeApi.new(), Clock.new())
	var screen: MissionsScreen = add_child_autofree(MissionsScreen.new())
	screen.setup(s)
	s.missions = _view(null, [_mission("daily_build", 0, 2)])
	s.missions_changed.emit()
	assert_has(_texts(screen), Loc.t("missions.allDone"))
	watch_signals(screen)
	screen.back_button().pressed.emit()
	assert_signal_emitted(screen, "closed")
