extends GutTest
## Camp talk (docs/camp-life-plan.md, step 3): a tap on someone shows a line of their kind or a hint at what the camp needs,
## in every language, over their head for a while.

const NOW := 1_793_800_000_000
const LEVELS := {"hq": 1, "farm": 1, "armory": 1, "treasury": 1, "barracks": 1, "hero_hall": 1}

func after_each() -> void:
	TranslationServer.set_locale("en")

func test_every_line_exists_in_each_language() -> void:
	var keys: Array[String] = ["camp.talk.hint.full", "camp.talk.hint.low", "camp.talk.hint.idle", "camp.talk.hint.hurt"]
	for pool: String in CampTalk.COUNT:
		for i in int(CampTalk.COUNT[pool]):
			keys.append("camp.talk.%s.%s" % [pool, CampTalk.NUMBERS[i]])
	for lang: String in ["en", "ar", "fr"]:
		TranslationServer.set_locale(lang)
		for key in keys:
			assert_ne(Loc.t(key, {"resource": "x"}), key, "%s in %s" % [key, lang])

func test_each_kind_of_person_talks_and_things_do_not() -> void:
	for kind: String in CampTalk.POOL:
		assert_true(String(CampTalk.line(kind, {}, 1)["key"]).begins_with("camp.talk.%s." % CampTalk.POOL[kind]), kind)
	for kind: String in ["tent", "fire", "sacks_big", "chest_small"]:
		assert_eq(CampTalk.line(kind, {}, 0), {}, kind)

func test_tapping_again_gives_the_next_line() -> void:
	var seen := {}
	for pick in 3:
		seen[CampTalk.line("worker", {}, pick)["key"]] = true
	assert_eq(seen.size(), 3)
	assert_eq(CampTalk.line("worker", {}, -7), CampTalk.line("worker", {}, 7), "a negative pick is fine")

func test_every_other_line_is_a_hint_when_the_camp_needs_something() -> void:
	var cap := Balance.storage_cap(1)
	var s := CampSummary.build(LEVELS, null, {"wounded": {"infantry": 3}}, {"food": cap["food"], "support": 0.0})
	assert_eq(CampTalk.hints(s).map(func(h: Dictionary) -> String: return h["key"]),
		["camp.talk.hint.full", "camp.talk.hint.idle", "camp.talk.hint.hurt"])
	assert_eq(CampTalk.line("guard", s, 0), {"key": "camp.talk.hint.full", "resource": "food"})
	assert_eq(CampTalk.line("guard", s, 2)["key"], "camp.talk.hint.idle")
	assert_true(String(CampTalk.line("guard", s, 1)["key"]).begins_with("camp.talk.watch."))
	var busy := CampSummary.build(LEVELS, {"building": "farm", "toLevel": 2, "startedAt": NOW, "endsAt": NOW + 1}, {}, {"food": cap["food"] * 0.5})
	assert_eq(CampTalk.hints(busy), [], "nothing to say")

func test_a_tap_finds_the_person_in_front() -> void:
	var list := [
		{"id": "a", "kind": "guard", "at": Vector2(100, 100)},
		{"id": "b", "kind": "farmer", "at": Vector2(104, 110)},
		{"id": "c", "kind": "tent", "at": Vector2(300, 300)},
	]
	assert_eq(CampLife.talker_at(list, Vector2(102, 90))["id"], "b", "the nearer one")
	assert_eq(CampLife.talker_at(list, Vector2(100, 60))["id"], "a", "only the farther one's head is there")
	assert_eq(CampLife.talker_at(list, Vector2(300, 290)), {}, "a tent does not talk")
	assert_eq(CampLife.talker_at(list, Vector2(500, 500)), {})

func test_everyone_on_screen_has_their_own_id() -> void:
	var s := CampSummary.build({"hq": 10}, {"building": "farm", "toLevel": 2, "startedAt": NOW, "endsAt": NOW + 1},
		{"training": {}, "wounded": {"infantry": 30}}, {})
	var ids := {}
	for f: Dictionary in CampLife.figures(NOW, s):
		ids[f["id"]] = true
	assert_eq(ids.size(), CampLife.figures(NOW, s).size())

func _view() -> BaseView:
	var layer := CanvasLayer.new()
	add_child_autofree(layer)
	var view := BaseView.new()
	view.layer = layer
	layer.add_child(view)
	view.build()
	view.apply_fit(Vector2(1080, 1920), 0.0, 0.0)
	view.set_state(LEVELS, null, NOW)
	return view

func test_tapping_someone_shows_their_line_over_them_and_it_goes_away() -> void:
	var view := _view()
	var guard: Dictionary = CampLife.figures(NOW).filter(func(f: Dictionary) -> bool: return f["kind"] == "guard")[0]
	assert_true(view.talk_at(guard["at"] - Vector2(0, 20)))
	assert_ne(view.talk_text(), "")
	assert_false(view.talk_text().begins_with("camp."), "a translated line")
	assert_lt(view._talk.position.y, guard["at"].y, "above the feet")
	view.set_state(LEVELS, null, NOW + BaseView.TALK_MS + 1)
	assert_eq(view.talk_text(), "", "gone after a while")

func test_a_tap_on_empty_ground_says_nothing() -> void:
	var view := _view()
	assert_false(view.talk_at(Vector2(30, 1330)))
	assert_eq(view.talk_text(), "")

func test_arabic_lines_show_in_arabic() -> void:
	TranslationServer.set_locale("ar")
	var view := _view()
	var guard: Dictionary = CampLife.figures(NOW).filter(func(f: Dictionary) -> bool: return f["kind"] == "guard")[0]
	view.talk_at(guard["at"] - Vector2(0, 20))
	assert_true(view.talk_text().unicode_at(0) >= 0x0600, view.talk_text())
