extends GutTest
## Session's hero level-up, against a fake Api.

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

func test_level_up_hero_sends_the_intent_once_and_takes_the_base() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [_ok({"ok": true, "state": {"resources": {}, "levels": {"hero_hall": 2}, "lastUpdated": 1, "heroes": {"owned": {"hill_commander": {"level": 2, "shards": 0}}, "pity": 0}}, "now": 10})]
	s.call("level_up_hero", "hill_commander")
	assert_eq(await s.level_up_hero("hill_commander"), {"ok": false, "reason": ""}, "a second press while one is out sends nothing")
	await wait_until(func() -> bool: return s.state.has("levels"), 5.0)
	assert_eq(api.posted.size(), 1)
	assert_eq(api.posted[0], {"type": "hero_level", "hero": "hill_commander"})
	assert_eq(s.state["heroes"]["owned"]["hill_commander"]["level"], 2)

func test_a_refused_level_up_returns_its_reason() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [_ok({"ok": false, "reason": "not_enough_shards", "state": {"resources": {}, "levels": {}, "lastUpdated": 1}, "now": 10})]
	assert_eq(await s.level_up_hero("hill_commander"), {"ok": false, "reason": "not_enough_shards"})

func test_recruit_returns_the_draw_and_sends_one_request() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [_ok({"ok": true, "state": {"resources": {}, "levels": {"hero_hall": 2}, "lastUpdated": 1, "heroes": {"owned": {"dock_foreman": {"level": 1, "shards": 0}}, "pity": 1}}, "now": 10, "draw": {"heroId": "dock_foreman", "rarity": "common", "duplicate": false, "forced": false}})]
	s.call("recruit")
	assert_eq(await s.recruit(), {"ok": false, "reason": ""}, "a second press while a draw is out sends nothing")
	await wait_until(func() -> bool: return s.state.has("heroes"), 5.0)
	assert_eq(api.posted, [{"type": "recruit"}])
	assert_eq(s.state["heroes"]["pity"], 1)

func test_the_verdict_carries_the_draw_and_a_refusal_does_not() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [_ok({"ok": true, "state": {"resources": {}, "levels": {}, "lastUpdated": 1}, "now": 1, "draw": {"heroId": "hill_commander", "rarity": "legendary", "duplicate": true, "forced": true}})]
	var v := await s.recruit()
	assert_true(v["ok"])
	assert_eq(v["draw"]["heroId"], "hill_commander")
	api.replies = [_ok({"ok": false, "reason": "insufficient", "state": {"resources": {}, "levels": {}, "lastUpdated": 2}, "now": 2})]
	assert_eq(await s.recruit(), {"ok": false, "reason": "insufficient"})
	api.replies = [_ok({"ok": true, "state": {"resources": {}, "levels": {}, "lastUpdated": 3}, "now": 3})]
	assert_eq(await s.send_intent({"type": "train", "troop": "infantry", "count": 1}), {"ok": true, "reason": ""}, "other intents keep their two keys")

func test_the_real_server_replies_to_a_draw_and_a_level_up() -> void:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/captured-heroes.json")), OK)
	var cap: Dictionary = parsed.data
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [{"ok": true, "status": 200, "data": cap["recruit_first"]}]
	var first := await s.recruit()
	assert_true(first["ok"])
	assert_eq(first["draw"], {"heroId": "dock_foreman", "rarity": "common", "duplicate": false, "forced": false})
	assert_eq(s.state["heroes"]["pity"], 1)
	api.replies = [{"ok": true, "status": 200, "data": cap["recruit_duplicate"]}]
	var again := await s.recruit()
	assert_true(again["draw"]["duplicate"])
	assert_eq(s.state["heroes"]["owned"]["dock_foreman"]["shards"], 4, "a duplicate adds the exported shard count")
	assert_eq(s.state["heroes"]["owned"]["dock_foreman"]["shards"], int(HeroesModel.progression()["shardsPerDuplicate"]))
	assert_eq(_card(s, "dock_foreman")["level_up"], "", "four shards pay the two for the next level")
	api.replies = [{"ok": true, "status": 200, "data": cap["level_up_ok"]}]
	assert_true((await s.level_up_hero("dock_foreman"))["ok"])
	var after := _card(s, "dock_foreman")
	assert_eq(int(after["owned"]["level"]), 2)
	assert_eq(int(after["owned"]["shards"]), 2)
	assert_eq(after["level_up"], "not_enough_shards", "level 2 needs three")
	api.replies = [{"ok": true, "status": 200, "data": cap["level_up_refused"]}]
	assert_eq(await s.level_up_hero("dock_foreman"), {"ok": false, "reason": "not_enough_shards"})

func _card(s: Session, id: String) -> Dictionary:
	for c: Dictionary in HeroesModel.cards(s.state, ""):
		if c["id"] == id:
			return c
	return {}
