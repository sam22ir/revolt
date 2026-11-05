extends GutTest
## Session's harvest intents: the payloads sent to /v1/intent, the verdict like a rally intent, the base a refused harvest carries, and a
## recall that races the return: its 404 is "not_found", not an error.

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

func _session(api: FakeApi) -> Session:
	var s := Session.new(api, Clock.new())
	s.apply({"state": {"resources": {}, "levels": {}, "lastUpdated": 1, "troops": {"infantry": 10}, "marches": []}, "now": 5})
	return s

func test_harvest_start_sends_the_site_and_the_troops() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": true, "status": 200, "data": {"ok": true, "state": {"resources": {}, "levels": {}, "lastUpdated": 1, "troops": {}, "marches": []}, "now": 6}}]
	var s := _session(api)
	var verdict: Dictionary = await s.harvest_start("farmland:0", {"infantry": 4, "scouts": 0, "heavy": 0, "porters": 2})
	assert_eq(api.posted[0], {"type": "harvest_start", "site": "farmland:0", "troops": {"infantry": 4, "scouts": 0, "heavy": 0, "porters": 2}})
	assert_true(verdict["ok"])

func test_a_refused_harvest_carries_its_reason_and_the_base() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": true, "status": 200, "data": {"ok": false, "reason": "site_taken", "state": {"resources": {}, "levels": {}, "lastUpdated": 1, "troops": {"infantry": 3}, "marches": []}, "now": 7}}]
	var s := _session(api)
	var verdict: Dictionary = await s.harvest_start("farmland:0", {"infantry": 1, "scouts": 0, "heavy": 0, "porters": 0})
	assert_false(verdict["ok"])
	assert_eq(verdict["reason"], "site_taken")
	assert_eq(s.state["troops"], {"infantry": 3}, "a refused harvest still carries the base, and it is applied")

func test_recall_sends_the_march_id() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": true, "status": 200, "data": {"ok": true, "state": {"resources": {}, "levels": {}, "lastUpdated": 1, "troops": {}, "marches": []}, "now": 9}}]
	var s := _session(api)
	var verdict: Dictionary = await s.harvest_recall("m-1")
	assert_eq(api.posted[0], {"type": "harvest_recall", "march": "m-1"})
	assert_true(verdict["ok"])

func test_a_recall_that_finds_no_march_is_not_found_not_an_error() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": false, "status": 404, "data": {"error": "not_found"}}]
	var s := _session(api)
	var verdict: Dictionary = await s.harvest_recall("gone")
	assert_false(verdict["ok"])
	assert_eq(verdict["reason"], "not_found")
	assert_true(s.online, "a 404 is an answer: the connection is fine")

func test_a_start_that_finds_no_base_is_an_error_not_not_found() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": false, "status": 404, "data": {"error": "not_found"}}]
	var s := _session(api)
	var verdict: Dictionary = await s.harvest_start("farmland:0", {"infantry": 1, "scouts": 0, "heavy": 0, "porters": 0})
	assert_eq(verdict["reason"], "error")

func test_one_harvest_intent_at_a_time() -> void:
	var api := FakeApi.new()
	var s := _session(api)
	# A harvest intent already out (the guard is set while one is in flight): nothing more is sent.
	s._harvest_pending = true
	var verdict: Dictionary = await s.harvest_recall("m-1")
	assert_eq(verdict["reason"], "", "nothing is sent while one is out")
	assert_eq(api.posted.size(), 0)
