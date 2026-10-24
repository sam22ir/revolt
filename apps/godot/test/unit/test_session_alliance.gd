extends GutTest
## Session's alliance actions and the chat's unread count, against a fake Api (the replies are popped in order).

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

func _view(id := "a1") -> Dictionary:
	return {"id": id, "name": "Wolves", "tag": "WLF", "myRank": "member", "maxMembers": 30, "hq": null,
		"members": [{"handle": "me", "rank": "member", "joinedAt": 1, "me": true}]}

func _line(id: int, handle := "other") -> Dictionary:
	return {"id": id, "at": 1, "handle": handle, "rank": "member", "text": "t%d" % id}

func _joined(api: FakeApi, id := "a1") -> Session:
	api.replies = [_ok({"alliance": _view(id), "help": [], "now": 1})]
	var s := Session.new(api, Clock.new())
	await s.refresh_alliance()
	return s

func test_the_first_answer_marks_the_alliance_known_and_announces_its_id() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"alliance": _view(), "help": [], "now": 1})]
	var s := Session.new(api, Clock.new())
	watch_signals(s)
	assert_false(s.alliance_known)
	await s.refresh_alliance()
	assert_true(s.alliance_known)
	assert_signal_emitted_with_parameters(s, "alliance_id_changed", ["a1"])

func test_a_refresh_for_the_same_alliance_keeps_the_chat_and_announces_nothing() -> void:
	var api := FakeApi.new()
	var s := await _joined(api)
	s.apply_alliance_message({"type": "history", "messages": [_line(1)]})
	watch_signals(s)
	api.replies = [_ok({"alliance": _view(), "help": [], "now": 2})]
	await s.refresh_alliance()
	assert_eq(s.chat.size(), 1)
	assert_signal_not_emitted(s, "alliance_id_changed")

func test_another_alliance_resets_the_chat_and_what_was_seen() -> void:
	var api := FakeApi.new()
	var s := await _joined(api)
	s.apply_alliance_message({"type": "history", "messages": [_line(5)]})
	watch_signals(s)
	api.replies = [_ok({"alliance": _view("a2"), "help": [], "now": 2})]
	await s.refresh_alliance()
	assert_eq(s.chat, [])
	assert_eq(s.chat_seen, -1)
	assert_signal_emitted_with_parameters(s, "alliance_id_changed", ["a2"])

func test_unread_first_history_counts_as_seen() -> void:
	var s := await _joined(FakeApi.new())
	assert_eq(s.unread(), 0)
	s.apply_alliance_message({"type": "history", "messages": [_line(1), _line(2)]})
	assert_eq(s.unread(), 0, "what was said before the player came is not new")
	s.apply_alliance_message({"type": "chat", "message": _line(3)})
	assert_eq(s.unread(), 1)

func test_unread_own_lines_never_count() -> void:
	var s := await _joined(FakeApi.new())
	s.apply_alliance_message({"type": "history", "messages": []})
	s.apply_alliance_message({"type": "chat", "message": _line(1, "me")})
	assert_eq(s.unread(), 0)
	s.apply_alliance_message({"type": "chat", "message": _line(2)})
	assert_eq(s.unread(), 1)

func test_opening_the_chat_marks_everything_seen_and_open_lines_are_seen() -> void:
	var s := await _joined(FakeApi.new())
	s.apply_alliance_message({"type": "history", "messages": []})
	s.apply_alliance_message({"type": "chat", "message": _line(1)})
	s.apply_alliance_message({"type": "chat", "message": _line(2)})
	assert_eq(s.unread(), 2)
	s.set_chat_open(true)
	assert_eq(s.unread(), 0)
	s.apply_alliance_message({"type": "chat", "message": _line(3)})
	assert_eq(s.unread(), 0, "a line that arrives while the chat is on screen is seen")
	s.set_chat_open(false)
	s.apply_alliance_message({"type": "chat", "message": _line(4)})
	assert_eq(s.unread(), 1)

func test_a_reconnect_history_does_not_count_seen_lines_again() -> void:
	var s := await _joined(FakeApi.new())
	s.apply_alliance_message({"type": "history", "messages": [_line(1)]})
	s.apply_alliance_message({"type": "chat", "message": _line(2)})
	s.apply_alliance_message({"type": "chat", "message": _line(3)})
	assert_eq(s.unread(), 2)
	s.apply_alliance_message({"type": "history", "messages": [_line(1), _line(2), _line(3)]})
	assert_eq(s.unread(), 2, "the same lines again: still the two unseen ones, not three")
	s.apply_alliance_message({"type": "history", "messages": [_line(1), _line(2), _line(3), _line(4)]})
	assert_eq(s.unread(), 3)

func test_a_kick_clears_the_alliance_and_the_chat_and_announces_none() -> void:
	var s := await _joined(FakeApi.new())
	s.apply_alliance_message({"type": "history", "messages": [_line(1)]})
	watch_signals(s)
	assert_true(s.apply_alliance_message({"type": "kicked"}))
	assert_null(s.alliance)
	assert_eq(s.chat, [])
	assert_eq(s.unread(), 0)
	assert_signal_emitted_with_parameters(s, "alliance_id_changed", [""])

func test_a_leave_reply_and_a_kicked_frame_in_either_order_announce_once() -> void:
	var api := FakeApi.new()
	var s := await _joined(api)
	watch_signals(s)
	s.apply_alliance_message({"type": "kicked"})
	api.replies = [_ok({"ok": true, "now": 3}), _ok({"alliance": null, "help": [], "now": 3})]
	var verdict := await s.leave_alliance()
	assert_true(verdict["ok"])
	assert_signal_emit_count(s, "alliance_id_changed", 1)
	# The other order: the reply first, the frame after (a fresh session, so the count starts at zero).
	var api2 := FakeApi.new()
	var s2 := await _joined(api2)
	watch_signals(s2)
	api2.replies = [_ok({"ok": true, "now": 5}), _ok({"alliance": null, "help": [], "now": 5})]
	await s2.leave_alliance()
	s2.apply_alliance_message({"type": "kicked"})
	assert_signal_emit_count(s2, "alliance_id_changed", 1)

func test_search_returns_the_list_or_null() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"alliances": [{"id": "a"}], "now": 1}), {"ok": false, "status": 0, "data": null}]
	var s := Session.new(api, Clock.new())
	assert_eq(await s.search_alliances("wo lf"), [{"id": "a"}])
	assert_eq(api.calls[0], "/v1/alliances?q=wo%20lf", "the query is encoded")
	assert_null(await s.search_alliances("x"))

func test_create_join_and_leave_post_and_fetch_the_alliance_on_success() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"ok": true, "now": 1}), _ok({"alliance": _view(), "help": [], "now": 1})]
	var s := Session.new(api, Clock.new())
	var verdict := await s.create_alliance("Wolves", "WLF")
	assert_true(verdict["ok"])
	assert_eq(api.calls, ["/v1/alliance", "/v1/alliance"] as Array[String])
	assert_eq(api.posted[0], {"name": "Wolves", "tag": "WLF"})
	assert_eq(AllianceModel.alliance_id(s.alliance), "a1")
	api.replies = [_ok({"ok": true, "now": 2}), _ok({"alliance": _view("a2"), "help": [], "now": 2})]
	await s.join_alliance("a2")
	assert_eq(api.posted[1], {"id": "a2"})
	assert_eq(AllianceModel.alliance_id(s.alliance), "a2")

func test_a_refusal_returns_its_reason_and_fetches_nothing() -> void:
	var api := FakeApi.new()
	api.replies = [_ok({"ok": false, "reason": "name_taken", "now": 1})]
	var s := Session.new(api, Clock.new())
	var verdict := await s.create_alliance("Wolves", "WLF")
	assert_eq(verdict, {"ok": false, "reason": "name_taken"})
	assert_eq(api.calls.size(), 1)

func test_no_answer_is_unreachable() -> void:
	var s := Session.new(FakeApi.new(), Clock.new())
	assert_eq(await s.join_alliance("a"), {"ok": false, "reason": "unreachable"})

func test_the_frames_the_real_server_sent_are_parsed_and_counted() -> void:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/captured-chat.json")), OK)
	var s := await _joined(FakeApi.new())
	for frame: Dictionary in parsed.data["frames"]:
		var msg: Variant = AllianceMessages.parse(JSON.stringify(frame))
		assert_not_null(msg, "the client accepts every captured frame: %s" % frame["type"])
		s.apply_alliance_message(msg)
	assert_eq(s.chat.size(), 2)
	assert_eq(s.unread(), 2, "the first history (empty) counted as seen, both lines came after it")
	s.set_chat_open(true)
	assert_eq(s.unread(), 0)
