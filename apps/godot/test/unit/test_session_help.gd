extends GutTest
## Session's alliance view and help requests, against a fake Api (the replies are popped in order).

class FakeApi:
	extends RefCounted
	var token := "t"
	var calls: Array[String] = []
	var replies: Array = []

	func get_json(path: String) -> Dictionary:
		calls.append(path)
		await (Engine.get_main_loop() as SceneTree).process_frame
		return replies.pop_front() if not replies.is_empty() else {"ok": false, "status": 0, "data": null}

	func post_json(path: String, _body: Variant = {}) -> Dictionary:
		calls.append(path)
		await (Engine.get_main_loop() as SceneTree).process_frame
		return replies.pop_front() if not replies.is_empty() else {"ok": false, "status": 0, "data": null}

func _session(api: FakeApi) -> Session:
	return Session.new(api, Clock.new())

func _ok(data: Dictionary) -> Dictionary:
	return {"ok": true, "status": 200, "data": data}

func _request(id: String, kind: String, mine: bool) -> Dictionary:
	return {"id": id, "kind": kind, "endsAt": 500, "mine": mine, "helps": 0, "maxHelps": 3, "helped": false, "handle": "x"}

func test_the_alliance_view_and_its_help_requests_are_kept() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"alliance": {"id": "a1"}, "help": [_request("r1", "upgrade", false), "junk"], "now": 10})]
	var s := _session(api)
	await s.refresh_alliance()
	assert_eq(s.alliance, {"id": "a1"})
	assert_eq(s.help.size(), 1, "a malformed entry is dropped")

func test_no_alliance_is_null_and_no_requests() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"alliance": null, "help": [], "now": 10})]
	var s := _session(api)
	await s.refresh_alliance()
	assert_null(s.alliance)
	assert_eq(s.help, [])

func test_an_answered_request_is_held_so_the_button_hides() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"ok": true, "request": _request("r9", "training", true), "now": 10})]
	var s := _session(api)
	var verdict := await s.request_help("training")
	assert_true(verdict["ok"])
	assert_eq(s.help.size(), 1)
	assert_true(HelpModel.is_request(s.help[0]))
	assert_false(HelpModel.can_ask({"id": "a"}, s.help, "training", 100))

func test_a_refusal_returns_its_reason_and_changes_nothing() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"ok": false, "reason": "no_job", "now": 10})]
	var s := _session(api)
	var verdict := await s.request_help("upgrade")
	assert_eq(verdict, {"ok": false, "reason": "no_job"})
	assert_eq(s.help, [])

func test_already_requested_fetches_the_alliance_again() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"ok": false, "reason": "already_requested", "now": 10}), _ok({"alliance": {"id": "a1"}, "help": [_request("r1", "upgrade", true)], "now": 11})]
	var s := _session(api)
	await s.request_help("upgrade")
	await (Engine.get_main_loop() as SceneTree).process_frame
	await (Engine.get_main_loop() as SceneTree).process_frame
	assert_eq(api.calls, ["/v1/help/request", "/v1/alliance"])
	assert_eq(s.help.size(), 1)

func test_a_second_press_while_the_request_is_out_sends_nothing() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"ok": true, "request": _request("r1", "upgrade", true), "now": 10})]
	var s := _session(api)
	s.call("request_help", "upgrade")
	var second := await s.request_help("upgrade")
	assert_eq(second, {"ok": false, "reason": ""})
	await (Engine.get_main_loop() as SceneTree).process_frame
	await (Engine.get_main_loop() as SceneTree).process_frame
	assert_eq(api.calls, ["/v1/help/request"])

func test_a_kick_clears_the_alliance_and_the_requests() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"alliance": {"id": "a1"}, "help": [_request("r1", "upgrade", true)], "now": 10})]
	var s := _session(api)
	await s.refresh_alliance()
	s.apply_alliance_message({"type": "kicked"})
	assert_null(s.alliance)
	assert_eq(s.help, [])

## The replies the mock server really gave (data/captured-help.json, captured, not generated): the request, a refusal, and the view.
func test_the_captured_server_replies_are_read() -> void:
	var parser := JSON.new()
	assert_eq(parser.parse(FileAccess.get_file_as_string("res://data/captured-help.json")), OK)
	var captured: Dictionary = parser.data
	var api := FakeApi.new()
	api.replies = [
		{"ok": true, "status": 200, "data": captured["request_ok"]},
		{"ok": true, "status": 200, "data": captured["request_already"]},
		{"ok": true, "status": 200, "data": captured["alliance"]},
		{"ok": true, "status": 200, "data": captured["request_no_job"]},
	]
	var s := _session(api)
	var asked := await s.request_help("training")
	assert_true(asked["ok"])
	assert_eq(s.help.size(), 1, "the answer's request is held")
	assert_true(bool(s.help[0]["mine"]))
	var again := await s.request_help("training")
	assert_eq(again, {"ok": false, "reason": "already_requested"}, "the refusal reason is read")
	await (Engine.get_main_loop() as SceneTree).process_frame
	await (Engine.get_main_loop() as SceneTree).process_frame
	assert_not_null(s.alliance, "the alliance view was fetched again")
	assert_eq(s.help.size(), 1, "the view's request is the one held")
	var none := await s.request_help("upgrade")
	assert_eq(none, {"ok": false, "reason": "no_job"})
