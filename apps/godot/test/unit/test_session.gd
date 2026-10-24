extends GutTest
## Session against a fake Api: replies sync the clock and replace the base, refreshes coalesce, a refused intent still
## carries the base, a 401 is reported and nothing more, and the alliance feed state follows the socket frames.

class FakeApi:
	extends RefCounted
	var token := "t"
	var calls: Array[String] = []
	var replies: Array = []
	var posted: Array = []

	## One frame per request, so tests can overlap calls.
	func get_json(path: String) -> Dictionary:
		calls.append(path)
		await (Engine.get_main_loop() as SceneTree).process_frame
		return replies.pop_front() if not replies.is_empty() else {"ok": false, "status": 0, "data": null}
	func post_json(path: String, body: Variant = {}) -> Dictionary:
		calls.append(path)
		posted.append(body)
		await (Engine.get_main_loop() as SceneTree).process_frame
		return replies.pop_front() if not replies.is_empty() else {"ok": false, "status": 0, "data": null}

var _ticks := [0]

func _session(api: FakeApi) -> Session:
	var s := Session.new(api, Clock.new())
	_ticks = [0]
	s.ticks = func() -> int: return _ticks[0]
	return s

func _state(food: int, last: int = 100) -> Dictionary:
	return {"resources": {"food": food}, "levels": {"farm": 1}, "lastUpdated": last}

func _ok(data: Dictionary) -> Dictionary:
	return {"ok": true, "status": 200, "data": data}

func test_apply_syncs_the_clock_and_replaces_the_base() -> void:
	var s := _session(FakeApi.new())
	s.apply({"state": _state(500), "now": 1_000_000, "liberations": [{"region": 3}]})
	assert_true(s.clock.is_synced())
	assert_eq(s.clock.now_ms(0), 1_000_000)
	assert_eq(s.resources, {"food": 500})
	assert_eq(s.last_updated, 100)
	assert_eq(s.liberations, [{"region": 3}])

func test_a_reply_without_state_only_syncs_the_clock() -> void:
	var s := _session(FakeApi.new())
	s.apply({"state": _state(500), "now": 1_000_000})
	s.apply({"now": 1_002_000})
	assert_eq(s.resources, {"food": 500}, "the base is untouched")
	assert_eq(s.clock.now_ms(0), 1_002_000)

func test_a_late_older_reply_does_not_move_the_clock_back() -> void:
	var s := _session(FakeApi.new())
	s.apply({"now": 1_004_000})
	_ticks[0] = 100
	s.apply({"now": 1_001_000})
	assert_eq(s.clock.now_ms(100), 1_004_100)

func test_refresh_fetches_state_and_applies_it() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"state": _state(700), "now": 2_000_000})]
	var s := _session(api)
	await s.refresh()
	assert_eq(api.calls, ["/v1/state"])
	assert_eq(s.resources, {"food": 700})

func test_refreshes_during_a_fetch_are_folded_into_one_more() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"state": _state(1), "now": 1}), _ok({"state": _state(2), "now": 2})]
	var s := _session(api)
	s.refresh()
	s.refresh()
	s.refresh()
	assert_eq(api.calls.size(), 1, "one request in flight, the rest wait")
	await wait_until(func() -> bool: return api.calls.size() >= 2 and s.resources == {"food": 2}, 5.0)
	await wait_process_frames(3)
	assert_eq(api.calls.size(), 2, "exactly one follow-up, so a push that landed after the answer is not lost")
	assert_eq(s.resources, {"food": 2})

func test_a_refresh_after_the_loop_ended_starts_a_new_fetch() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"state": _state(1), "now": 1}), _ok({"state": _state(2), "now": 2})]
	var s := _session(api)
	await s.refresh()
	await s.refresh()
	assert_eq(api.calls.size(), 2)

func test_a_refused_intent_still_applies_the_base() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"ok": false, "reason": "insufficient_resources", "state": _state(40), "now": 3_000_000})]
	var s := _session(api)
	var verdict := await s.send_intent({"type": "upgrade", "building": "farm"})
	assert_eq(verdict, {"ok": false, "reason": "insufficient_resources"})
	assert_eq(s.resources, {"food": 40})
	assert_eq(api.posted, [{"type": "upgrade", "building": "farm"}])

func test_an_accepted_intent_returns_ok_and_applies_the_base() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"ok": true, "state": _state(10), "now": 3_000_000})]
	var s := _session(api)
	var verdict := await s.send_intent({"type": "upgrade", "building": "farm"})
	assert_eq(verdict, {"ok": true, "reason": ""})
	assert_eq(s.resources, {"food": 10})

func test_an_intent_with_no_answer_is_unreachable() -> void:
	var s := _session(FakeApi.new())
	var verdict := await s.send_intent({"type": "upgrade", "building": "farm"})
	assert_eq(verdict, {"ok": false, "reason": "unreachable"})

func test_a_401_is_reported_and_changes_nothing() -> void:
	var api := FakeApi.new()
	api.replies = [{"ok": false, "status": 401, "data": {"error": "unauthorized"}}]
	var s := _session(api)
	s.apply({"state": _state(500), "now": 1})
	watch_signals(s)
	await s.refresh()
	assert_signal_emitted(s, "auth_lost")
	assert_eq(s.resources, {"food": 500}, "the base stays; no new guest is created here")

func test_reports_keep_the_newest_first_and_are_capped() -> void:
	var s := _session(FakeApi.new())
	watch_signals(s)
	for i in Session.MAX_REPORTS + 5:
		s.add_report({"id": "r%d" % i})
	assert_eq(s.reports.size(), Session.MAX_REPORTS)
	assert_eq(s.reports[0]["id"], "r%d" % (Session.MAX_REPORTS + 4))
	assert_signal_emit_count(s, "report_received", Session.MAX_REPORTS + 5)

func _line(id: int) -> Dictionary:
	return {"id": id, "at": 1, "handle": "H", "rank": "member", "text": "t%d" % id}

func test_chat_history_replaces_and_live_lines_append_once() -> void:
	var s := _session(FakeApi.new())
	assert_false(s.apply_alliance_message({"type": "history", "messages": [_line(1), _line(2)]}))
	assert_eq(s.chat.size(), 2)
	s.apply_alliance_message({"type": "chat", "message": _line(3)})
	s.apply_alliance_message({"type": "chat", "message": _line(3)})
	s.apply_alliance_message({"type": "chat", "message": _line(2)})
	assert_eq(s.chat.size(), 3, "a line that is already there, or older, is not added again")
	s.apply_alliance_message({"type": "history", "messages": [_line(5)]})
	assert_eq(s.chat.size(), 1, "a reconnect's history replaces the chat")

func test_chat_is_capped_to_the_newest_lines() -> void:
	var s := _session(FakeApi.new())
	var lines := []
	for i in Session.MAX_CHAT + 10:
		lines.append(_line(i + 1))
	s.apply_alliance_message({"type": "history", "messages": lines})
	assert_eq(s.chat.size(), Session.MAX_CHAT)
	assert_eq(int(s.chat[0]["id"]), 11)

func test_kicked_clears_the_chat_and_asks_the_caller_to_stop() -> void:
	var s := _session(FakeApi.new())
	s.apply_alliance_message({"type": "history", "messages": [_line(1)]})
	watch_signals(s)
	assert_true(s.apply_alliance_message({"type": "kicked"}))
	assert_eq(s.chat, [])
	assert_signal_emitted(s, "alliance_changed")

func test_member_and_help_changes_are_announced() -> void:
	var s := _session(FakeApi.new())
	watch_signals(s)
	s.apply_alliance_message({"type": "members_changed"})
	s.apply_alliance_message({"type": "help_changed"})
	assert_signal_emit_count(s, "alliance_changed", 2)

func test_a_late_older_state_reply_does_not_overwrite_a_newer_base() -> void:
	var s := _session(FakeApi.new())
	watch_signals(s)
	s.apply({"state": _state(10), "now": 2000, "liberations": [{"region": 1}]})
	# A /v1/state fetch started before the intent answers after it.
	s.apply({"state": _state(500), "now": 1000, "liberations": [{"region": 9}]})
	assert_eq(s.resources, {"food": 10}, "the older base was not applied")
	assert_eq(s.liberations, [{"region": 1}])
	assert_signal_emit_count(s, "state_changed", 1)

func test_an_equal_or_newer_reply_is_taken() -> void:
	var s := _session(FakeApi.new())
	s.apply({"state": _state(10), "now": 2000})
	s.apply({"state": _state(20), "now": 2000})
	assert_eq(s.resources, {"food": 20}, "equal is taken")
	s.apply({"state": _state(30), "now": 3000})
	assert_eq(s.resources, {"food": 30})

func test_a_reply_without_a_stamp_is_taken() -> void:
	var s := _session(FakeApi.new())
	s.apply({"state": _state(10), "now": 2000})
	s.apply({"state": _state(40)})
	assert_eq(s.resources, {"food": 40})

func test_snapshot_liberations_follow_the_same_rule() -> void:
	var s := _session(FakeApi.new())
	s.set_liberations([{"region": 1}], 2000)
	s.set_liberations([{"region": 2}], 1000)
	assert_eq(s.liberations, [{"region": 1}], "an older snapshot does not win")
	s.set_liberations([{"region": 3}], 3000)
	assert_eq(s.liberations, [{"region": 3}])
