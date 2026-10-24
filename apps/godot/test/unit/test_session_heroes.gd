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
	await wait_frames(3)
	assert_eq(api.posted.size(), 1)
	assert_eq(api.posted[0], {"type": "hero_level", "hero": "hill_commander"})
	assert_eq(s.state["heroes"]["owned"]["hill_commander"]["level"], 2)

func test_a_refused_level_up_returns_its_reason() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [_ok({"ok": false, "reason": "not_enough_shards", "state": {"resources": {}, "levels": {}, "lastUpdated": 1}, "now": 10})]
	assert_eq(await s.level_up_hero("hill_commander"), {"ok": false, "reason": "not_enough_shards"})
