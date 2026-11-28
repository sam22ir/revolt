extends GutTest
## Story: the model over the exported chapters (a port of objectiveProgress and chapterStatus), the Session's claim (against a fake
## Api), and the page.

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

func after_each() -> void:
	TranslationServer.set_locale("en")
	Loc.background_id = ""

func _state(chapter := 0, hq := 1, extra := {}) -> Dictionary:
	var s := {"levels": {"hq": hq, "farm": 1}, "resources": {}, "troops": {"infantry": 5}, "marches": [], "heroes": {"owned": {}}, "story": {"chapter": chapter, "victories": 0}}
	s.merge(extra, true)
	return s

func test_the_chapters_come_from_the_exported_table_with_the_default_for_an_unknown_background() -> void:
	var algeria := StoryModel.chapters("algeria")
	assert_eq(algeria.size(), 3)
	assert_eq(algeria[0]["id"], "ch1")
	assert_eq(StoryModel.chapters(""), algeria)
	assert_eq(StoryModel.chapters("nowhere"), algeria)
	assert_eq(StoryModel.chapters("vietnam").size(), 3)

func test_building_progress_is_capped_at_the_need() -> void:
	var o := {"kind": "building_level", "building": "hq", "level": 2}
	assert_eq(StoryModel.progress(_state(0, 1), o), {"done": false, "have": 1, "need": 2})
	assert_eq(StoryModel.progress(_state(0, 5), o), {"done": true, "have": 2, "need": 2})

func test_troops_count_those_at_home_and_out_on_marches() -> void:
	var s := _state(0, 1, {"troops": {"infantry": 5, "scouts": 3}, "marches": [{"troops": {"infantry": 7}}, {"troops": {}}]})
	assert_eq(StoryModel.owned_troops(s), 15)
	assert_eq(StoryModel.progress(s, {"kind": "troops_owned", "count": 20}), {"done": false, "have": 15, "need": 20})

func test_hero_objectives_take_any_hero_or_the_named_one() -> void:
	var s := _state(0, 1, {"heroes": {"owned": {"mountain_guide": {"level": 3}, "trail_scout": {"level": 1}}}})
	assert_true(StoryModel.progress(s, {"kind": "hero_recruited", "hero": null})["done"])
	assert_false(StoryModel.progress(_state(), {"kind": "hero_recruited", "hero": null})["done"], "no hero owned")
	assert_eq(StoryModel.progress(s, {"kind": "hero_level", "hero": null, "level": 5})["have"], 3)
	assert_eq(StoryModel.progress(s, {"kind": "hero_level", "hero": "trail_scout", "level": 2})["have"], 1)
	assert_false(StoryModel.progress(s, {"kind": "hero_recruited", "hero": "field_medic"})["done"])

func test_victories_and_an_unknown_kind() -> void:
	var s := _state(0, 1, {"story": {"chapter": 0, "victories": 4}})
	assert_eq(StoryModel.progress(s, {"kind": "victories", "count": 3}), {"done": true, "have": 3, "need": 3})
	assert_false(StoryModel.progress(s, {"kind": "mystery"})["done"])

func test_status_follows_the_current_chapter() -> void:
	assert_eq(StoryModel.status(_state(0, 1), "algeria"), "in_progress")
	assert_eq(StoryModel.status(_state(0, 2), "algeria"), "ready")
	assert_true(StoryModel.claimable(_state(0, 2), "algeria"))
	assert_eq(StoryModel.status(_state(3, 9), "algeria"), "complete")
	assert_true(StoryModel.current(_state(3), "algeria").is_empty())
	assert_false(StoryModel.claimable({}, "algeria"), "no base yet")

func test_a_missing_or_bad_story_field_counts_as_the_first_chapter() -> void:
	assert_eq(StoryModel.claimed({}), 0)
	assert_eq(StoryModel.claimed({"story": {"chapter": -2}}), 0)
	assert_eq(StoryModel.current({"levels": {"hq": 1}}, "algeria")["id"], "ch1")

func test_objective_text_keys_and_values() -> void:
	assert_eq(StoryModel.objective_text({"kind": "building_level", "building": "hq", "level": 2}), {"key": "story.objective.building_level", "building": "hq", "level": 2})
	assert_eq(StoryModel.objective_text({"kind": "hero_recruited", "hero": null}), {"key": "story.objective.hero_recruited"})
	assert_eq(StoryModel.objective_text({"kind": "hero_level", "hero": "trail_scout", "level": 3})["key"], "story.objective.hero_level_named")
	assert_eq(StoryModel.title_key("", {"id": "ch2"}), "story.algeria.ch2.title")
	assert_eq(StoryModel.scene_key("vietnam", {"id": "ch1"}, 2), "story.vietnam.ch1.scene2")

func test_the_reward_items_are_resources_then_shards() -> void:
	var items := StoryModel.reward_items(StoryModel.chapters("algeria")[0])
	assert_eq(items.map(func(i: Dictionary) -> String: return "%s:%s:%d" % [i["kind"], i["id"], i["amount"]]), ["resource:food:100", "resource:materiel:100", "resource:funds:300", "resource:support:30", "shards:heroes:10"])

func test_every_story_key_the_page_uses_is_translated_in_en_and_ar() -> void:
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		for bg in ["algeria", "vietnam"]:
			for c: Dictionary in StoryModel.chapters(bg):
				var title := StoryModel.title_key(bg, c)
				assert_ne(Loc.t(title), title, "%s %s" % [lang, title])
				for n in range(1, int(c["scenes"]) + 1):
					var key := StoryModel.scene_key(bg, c, n)
					assert_ne(Loc.t(key), key, "%s %s" % [lang, key])
				for o: Dictionary in c["objectives"]:
					var k: String = StoryModel.objective_text(o)["key"]
					assert_ne(Loc.t(k), k, "%s %s" % [lang, k])

func test_a_claim_posts_the_intent_once_and_takes_the_base() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [{"ok": true, "status": 200, "data": {"ok": true, "state": {"resources": {}, "levels": {"hq": 2}, "lastUpdated": 1, "story": {"chapter": 1, "victories": 0}}, "now": 10}}]
	s.call("claim_story")
	assert_eq(await s.claim_story(), {"ok": false, "reason": ""}, "a second press while one is out sends nothing")
	await wait_until(func() -> bool: return s.state.has("story"), 5.0)
	assert_eq(api.calls, ["/v1/intent"] as Array[String])
	assert_eq(api.posted[0], {"type": "story_claim"})
	assert_eq(StoryModel.claimed(s.state), 1)

func test_a_refused_claim_returns_its_reason() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [{"ok": true, "status": 200, "data": {"ok": false, "reason": "objectives_unmet", "now": 10}}]
	assert_eq(await s.claim_story(), {"ok": false, "reason": "objectives_unmet"})
	assert_eq(await s.claim_story(), {"ok": false, "reason": "unreachable"})

func _texts(root: Node) -> Array:
	return root.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func _button(root: Node, text: String) -> Button:
	for b: Button in root.find_children("*", "Button", true, false):
		if b.text == text:
			return b
	return null

func _screen(state: Dictionary) -> Array:
	var s := Session.new(FakeApi.new(), Clock.new())
	s.background = "algeria"
	var screen: StoryScreen = add_child_autofree(StoryScreen.new())
	screen.setup(s)
	s.state = state
	s.state_changed.emit()
	return [s, screen]

func test_the_page_shows_the_draft_notice_the_chapter_and_its_objectives() -> void:
	var screen: StoryScreen = _screen(_state(0, 1))[1]
	var texts := _texts(screen)
	assert_has(texts, Loc.t("story.draftNotice"))
	assert_has(texts, Loc.t("story.algeria.ch1.scene1"))
	assert_has(texts, Loc.t("story.sceneOf", {"n": "1", "total": "2"}))
	assert_has(texts, Loc.t("story.objective.building_level", {"building": Loc.t("building.hq.name"), "level": "2"}))
	assert_has(texts, Loc.t("story.progress", {"have": "1", "need": "2"}))
	assert_true(_button(screen, Loc.t("story.claim")).disabled, "objectives unmet")

func test_next_and_back_step_through_the_scenes() -> void:
	var screen: StoryScreen = _screen(_state(0, 1))[1]
	assert_true(_button(screen, Loc.t("story.back")).disabled)
	_button(screen, Loc.t("story.next")).pressed.emit()
	assert_has(_texts(screen), Loc.t("story.algeria.ch1.scene2"))
	assert_true(_button(screen, Loc.t("story.next")).disabled, "the last scene")
	_button(screen, Loc.t("story.back")).pressed.emit()
	assert_has(_texts(screen), Loc.t("story.algeria.ch1.scene1"))

func test_claim_offers_the_reward_instead_of_claiming_straight_away() -> void:
	var pair := _screen(_state(0, 2))
	var screen: StoryScreen = pair[1]
	watch_signals(screen)
	var claim := _button(screen, Loc.t("story.claim"))
	assert_false(claim.disabled)
	claim.pressed.emit()
	var heading := screen.chapter_heading(0, StoryModel.chapters("algeria")[0])
	assert_signal_emitted_with_parameters(screen, "claim_requested", [heading, "", StoryModel.reward_items(StoryModel.chapters("algeria")[0])])

func test_claimed_chapters_open_again_for_reading_and_back_returns() -> void:
	var screen: StoryScreen = _screen(_state(1, 2))[1]
	var ch1 := screen.chapter_heading(0, StoryModel.chapters("algeria")[0])
	assert_has(_texts(screen), Loc.t("story.completed"))
	_button(screen, ch1).pressed.emit()
	assert_true(screen.is_replaying())
	assert_has(_texts(screen), Loc.t("story.algeria.ch1.scene1"))
	assert_null(_button(screen, Loc.t("story.claim")), "no claim while reading again")
	watch_signals(screen)
	screen.back_button().pressed.emit()
	assert_false(screen.is_replaying())
	assert_signal_not_emitted(screen, "closed", "back leaves the chapter first")
	screen.back_button().pressed.emit()
	assert_signal_emitted(screen, "closed")

func test_a_finished_campaign_says_so() -> void:
	var screen: StoryScreen = _screen(_state(3, 9))[1]
	assert_has(_texts(screen), Loc.t("story.complete"))
	assert_null(_button(screen, Loc.t("story.claim")))

func test_the_page_reads_in_arabic() -> void:
	TranslationServer.set_locale("ar")
	var screen: StoryScreen = _screen(_state(0, 1))[1]
	assert_has(_texts(screen), Loc.t("story.algeria.ch1.scene1"))
	assert_eq(screen.title_text(), Loc.t("story.title"))
