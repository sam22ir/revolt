extends GutTest
## Session's wallet and the speed-up press, against a fake Api.

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

func _wallet(tokens: int, used := 0) -> Dictionary:
	return {"speedupTokens": tokens, "usedTodayMs": used, "dailyCapMs": 14_400_000}

func test_the_wallet_is_unknown_until_the_server_says() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	assert_eq(s.wallet, {})
	api.replies = [_ok({"products": [], "wallet": _wallet(5), "canRedeem": true, "now": 1000})]
	await s.load_wallet()
	assert_eq(api.calls, ["/v1/store"] as Array[String])
	assert_eq(s.wallet["speedupTokens"], 5)
	assert_eq(s.wallet["at"], 1000, "stamped with the server time of the answer")

func test_an_older_wallet_does_not_overwrite_a_newer_one() -> void:
	var s := Session.new(FakeApi.new(), Clock.new())
	s.apply({"wallet": _wallet(4), "now": 2000})
	s.apply({"wallet": _wallet(5), "now": 1000})
	assert_eq(s.wallet["speedupTokens"], 4, "a slow start-up fetch cannot undo a speed-up's answer")

func test_a_malformed_wallet_is_ignored() -> void:
	var s := Session.new(FakeApi.new(), Clock.new())
	s.apply({"wallet": {"speedupTokens": "many"}, "now": 1})
	assert_eq(s.wallet, {})

func test_speed_up_sends_one_token_and_takes_the_wallet_and_base() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [_ok({"ok": true, "state": {"resources": {"food": 1}, "levels": {"hq": 1}, "lastUpdated": 5}, "wallet": _wallet(4, 900_000), "now": 3000})]
	var verdict := await s.speed_up("upgrade")
	assert_true(verdict["ok"])
	assert_eq(api.posted[0], {"type": "speedup", "job": "upgrade", "tokens": 1})
	assert_eq(s.wallet["speedupTokens"], 4)
	assert_eq(s.wallet["usedTodayMs"], 900_000)
	assert_eq(s.resources, {"food": 1})

func test_a_refusal_returns_its_reason_and_still_takes_the_wallet() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [_ok({"ok": false, "reason": "hq_job", "state": {"resources": {}, "levels": {}, "lastUpdated": 1}, "wallet": _wallet(2), "now": 10})]
	assert_eq(await s.speed_up("upgrade"), {"ok": false, "reason": "hq_job"})
	assert_eq(s.wallet["speedupTokens"], 2)

func test_a_double_press_spends_one_token() -> void:
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [_ok({"ok": true, "state": {"resources": {}, "levels": {}, "lastUpdated": 1}, "wallet": _wallet(4), "now": 10})]
	s.call("speed_up", "training")
	var second := await s.speed_up("training")
	assert_eq(second, {"ok": false, "reason": ""})
	await wait_until(func() -> bool: return s.wallet.has("speedupTokens"), 5.0)
	assert_eq(api.posted.size(), 1, "one request for two presses")

func test_the_real_server_replies_to_a_speed_up() -> void:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/captured-speedup.json")), OK)
	var cap: Dictionary = parsed.data
	var api := FakeApi.new()
	var s := Session.new(api, Clock.new())
	api.replies = [{"ok": true, "status": 200, "data": cap["store_wallet_fresh"]}]
	await s.load_wallet()
	assert_eq(s.wallet["speedupTokens"], 0)
	var job_before := {"endsAt": cap["success"]["now"] + 180_000}
	assert_eq(SpeedupModel.reason("training", job_before, s.wallet, int(cap["success"]["now"])), "too_few_tokens")
	api.replies = [{"ok": true, "status": 200, "data": cap["success"]}]
	var verdict := await s.speed_up("training")
	assert_true(verdict["ok"])
	assert_eq(s.wallet["speedupTokens"], 4)
	assert_eq(s.wallet["usedTodayMs"], 182989)
	assert_eq(float(s.state["training"]["endsAt"]), float(cap["success"]["now"]), "the batch ends now")
	api.replies = [{"ok": true, "status": 200, "data": cap["refused_no_job"]}]
	assert_eq(await s.speed_up("upgrade"), {"ok": false, "reason": "no_speedup_job"})
	assert_null(s.state["training"], "the refusal's base is applied too")
