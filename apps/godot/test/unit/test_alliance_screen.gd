extends GutTest
## AllianceScreen: loading, browse and joined views follow the session; Send hands the trimmed line to the socket callback and says
## so when it is not sent; the leave button asks first (or says a leader must hand over).

class FakeApi:
	extends RefCounted
	var token := "t"
	var replies: Array = []
	var calls: Array[String] = []
	func get_json(_path: String) -> Dictionary:
		calls.append(_path)
		await (Engine.get_main_loop() as SceneTree).process_frame
		return replies.pop_front() if not replies.is_empty() else {"ok": false, "status": 0, "data": null}
	func post_json(_path: String, _body: Variant = {}) -> Dictionary:
		return await get_json(_path)

func _view(rank: String, members: int) -> Dictionary:
	var list := []
	for i in members:
		list.append({"handle": "m%d" % i, "rank": "member", "me": i == 0})
	return {"id": "a1", "name": "Wolves", "tag": "WLF", "myRank": rank, "members": list, "maxMembers": 30}

func _screen(alliance: Variant, api := FakeApi.new()) -> Array:
	api.replies = [{"ok": true, "status": 200, "data": {"alliance": alliance, "help": [], "now": 1}}, {"ok": true, "status": 200, "data": {"alliances": [], "now": 1}}]
	var session := Session.new(api, Clock.new())
	var screen: AllianceScreen = add_child_autofree(AllianceScreen.new())
	screen.setup(session)
	return [screen, session]

func _buttons(root: Node, text: String) -> Array:
	return root.find_children("*", "Button", true, false).filter(func(b: Button) -> bool: return b.text == text)

func test_it_says_loading_until_the_alliance_is_known_then_shows_the_right_view() -> void:
	var pair := _screen(_view("member", 2))
	var screen: AllianceScreen = pair[0]
	assert_true(screen._loading.visible)
	assert_false(screen._joined.visible)
	await pair[1].refresh_alliance()
	assert_false(screen._loading.visible)
	assert_true(screen._joined.visible)
	assert_false(screen._browse_scroll.visible)

func test_without_an_alliance_it_offers_search_and_found() -> void:
	var pair := _screen(null)
	await pair[1].refresh_alliance()
	var screen: AllianceScreen = pair[0]
	assert_true(screen._browse_scroll.visible)
	assert_false(screen._joined.visible)
	assert_eq(_buttons(screen, Loc.t("alliance.create")).size(), 1)

func test_send_gives_the_trimmed_line_to_the_socket_and_clears_the_box() -> void:
	var pair := _screen(_view("member", 2))
	await pair[1].refresh_alliance()
	var screen: AllianceScreen = pair[0]
	var sent: Array = []
	screen.send_chat = func(text: String) -> bool:
		sent.append(text)
		return true
	screen._chat_input.text = "  hello  "
	screen._on_send()
	assert_eq(sent, ["hello"])
	assert_eq(screen._chat_input.text, "")
	screen._chat_input.text = "   "
	screen._on_send()
	assert_eq(sent.size(), 1, "an empty line is not sent")

func test_a_line_that_could_not_be_sent_is_kept_and_reported() -> void:
	var pair := _screen(_view("member", 2))
	await pair[1].refresh_alliance()
	var screen: AllianceScreen = pair[0]
	screen._chat_input.text = "hello"
	screen._on_send()
	assert_eq(screen._chat_input.text, "hello")
	assert_true(screen._note.visible)
	assert_eq(screen._note.text, Loc.t("chat.notSent"))

func test_leave_asks_first_and_a_leader_with_members_is_told_to_hand_over() -> void:
	var pair := _screen(_view("member", 2))
	await pair[1].refresh_alliance()
	var screen: AllianceScreen = pair[0]
	screen._on_leave()
	assert_true(screen._confirm_box.visible)
	assert_eq(screen._confirm_label.text, Loc.t("alliance.confirmLeave"))
	var leader := _screen(_view("leader", 3))
	await leader[1].refresh_alliance()
	var other: AllianceScreen = leader[0]
	other._on_leave()
	assert_false(other._confirm_box.visible)
	assert_eq(other._note.text, Loc.t("reason.leader_must_transfer"))

func test_chat_lines_are_drawn_with_their_sender() -> void:
	var pair := _screen(_view("member", 2))
	await pair[1].refresh_alliance()
	(pair[0] as AllianceScreen).select_tab("chat")
	pair[1].apply_alliance_message({"type": "history", "messages": [{"id": 1, "at": 1792857900000, "handle": "ZED", "rank": "officer", "text": "hello <b>x</b>"}]})
	var texts := (pair[0] as AllianceScreen)._chat_box.get_children().map(func(l: Label) -> String: return l.text)
	assert_eq(texts.size(), 2)
	assert_true((texts[0] as String).begins_with("ZED · "))
	assert_eq(texts[1], "hello <b>x</b>", "text is shown as typed, never as markup")

func test_a_hidden_screen_does_not_search_and_one_search_runs_when_it_is_shown() -> void:
	var api := FakeApi.new()
	var pair := _screen(null, api)
	var screen: AllianceScreen = pair[0]
	screen.visible = false
	await pair[1].refresh_alliance()
	await get_tree().process_frame
	assert_eq(api.calls, ["/v1/alliance"] as Array[String], "no /v1/alliances while the screen is hidden")
	screen.visible = true
	await get_tree().process_frame
	await get_tree().process_frame
	assert_eq(api.calls, ["/v1/alliance", "/v1/alliances?q="] as Array[String], "exactly one search on opening")

func _line(id: int, handle := "other") -> Dictionary:
	return {"id": id, "at": 1, "handle": handle, "rank": "member", "text": "t%d" % id}

func test_chat_counts_as_open_only_when_visible_in_an_alliance_on_the_chat_tab() -> void:
	var pair := _screen(_view("member", 2))
	var screen: AllianceScreen = pair[0]
	var s: Session = pair[1]
	await s.refresh_alliance()
	s.apply_alliance_message({"type": "history", "messages": []})
	s.apply_alliance_message({"type": "chat", "message": _line(1)})
	assert_eq(s.unread(), 1, "on the Members tab (the default) lines keep counting")
	screen.select_tab("chat")
	assert_eq(s.unread(), 0, "opening the chat marks them seen")
	s.apply_alliance_message({"type": "chat", "message": _line(2)})
	assert_eq(s.unread(), 0, "a line that arrives while the chat is on screen is seen")
	screen.visible = false
	s.apply_alliance_message({"type": "chat", "message": _line(3)})
	assert_eq(s.unread(), 1, "a hidden screen does not read the chat")
	screen.visible = true
	assert_eq(s.unread(), 0, "showing it on the chat tab reads it")
	screen.select_tab("members")
	s.apply_alliance_message({"type": "chat", "message": _line(4)})
	assert_eq(s.unread(), 1)

func test_the_chat_tab_shows_the_unread_count() -> void:
	var pair := _screen(_view("member", 2))
	var screen: AllianceScreen = pair[0]
	await pair[1].refresh_alliance()
	pair[1].apply_alliance_message({"type": "history", "messages": []})
	pair[1].apply_alliance_message({"type": "chat", "message": _line(1)})
	assert_true(screen._chat_badge.is_shown())
	assert_eq(screen._chat_badge.text(), "1")
	screen.select_tab("chat")
	assert_false(screen._chat_badge.is_shown())

func test_members_are_listed_with_the_actions_their_rank_allows() -> void:
	var view := _view("leader", 3)
	view["members"][1]["rank"] = "officer"
	var pair := _screen(view)
	await pair[1].refresh_alliance()
	var screen: AllianceScreen = pair[0]
	assert_eq(screen._rows_box.get_child_count(), 3)
	assert_eq(_buttons(screen._rows_box, Loc.t("alliance.action.demote")).size(), 1, "only the officer can be demoted")
	assert_eq(_buttons(screen._rows_box, Loc.t("alliance.action.promote")).size(), 1, "only the plain member can be promoted")
	assert_eq(_buttons(screen._rows_box, Loc.t("alliance.action.transfer")).size(), 2, "not on the player's own row")

func test_kick_and_hand_over_ask_first_with_the_handle() -> void:
	var view := _view("leader", 2)
	var pair := _screen(view)
	await pair[1].refresh_alliance()
	var screen: AllianceScreen = pair[0]
	screen._on_member_action("kick", "m1")
	assert_true(screen._confirm_box.visible)
	assert_eq(screen._confirm_label.text, Loc.t("alliance.confirmKick", {"handle": "m1"}))
	screen._no_button.pressed.emit()
	assert_false(screen._confirm_box.visible)
	screen._on_member_action("transfer", "m1")
	assert_eq(screen._confirm_label.text, Loc.t("alliance.confirmTransfer", {"handle": "m1"}))
	screen.select_tab("chat")
	assert_true(screen._pending.is_empty(), "changing tab drops the question")

func test_a_leader_with_members_sees_the_hand_over_note_under_leave() -> void:
	var pair := _screen(_view("leader", 3))
	await pair[1].refresh_alliance()
	assert_true((pair[0] as AllianceScreen)._leader_note.visible)
	var other := _screen(_view("member", 3))
	await other[1].refresh_alliance()
	assert_false((other[0] as AllianceScreen)._leader_note.visible)

func _help_request(id: String, ends_at := 100_000, mine := false, helped := false, helps := 0) -> Dictionary:
	return {"id": id, "handle": "ZED", "kind": "training", "endsAt": ends_at, "helps": helps, "maxHelps": 5, "mine": mine, "helped": helped}

func _help_screen(requests: Array) -> Array:
	var pair := _screen(_view("member", 2))
	await pair[1].refresh_alliance()
	pair[1].help = requests
	pair[0].select_tab("help")
	return pair

func test_the_help_tab_lists_open_requests_and_disables_the_ones_you_cannot_give() -> void:
	var pair := await _help_screen([_help_request("a"), _help_request("b", 100_000, true), _help_request("c", 100_000, false, true), _help_request("gone", 10)])
	var screen: AllianceScreen = pair[0]
	screen.tick(1000)
	assert_eq(screen._help_rows.get_child_count(), 3, "the ended request is not listed")
	var gives := _buttons(screen._help_rows, Loc.t("help.give"))
	assert_eq(gives.size(), 3)
	assert_false(gives[0].disabled)
	assert_true(gives[1].disabled, "your own request")
	assert_true(gives[2].disabled, "already helped")

func test_an_empty_help_tab_says_so() -> void:
	var pair := await _help_screen([])
	pair[0].tick(1000)
	assert_true(pair[0]._help_empty.visible)

func test_the_countdown_changes_every_tick_but_the_button_is_not_replaced() -> void:
	var pair := await _help_screen([_help_request("a")])
	var screen: AllianceScreen = pair[0]
	screen.tick(1000)
	var button: Button = _buttons(screen._help_rows, Loc.t("help.give"))[0]
	var first: String = screen._countdowns["a"].text
	screen.tick(61_000)
	assert_ne(screen._countdowns["a"].text, first, "the countdown moved")
	assert_same(_buttons(screen._help_rows, Loc.t("help.give"))[0], button, "the same button, still there to be tapped")

func test_rows_are_rebuilt_when_a_request_is_helped_or_ends() -> void:
	var pair := await _help_screen([_help_request("a"), _help_request("b", 50_000)])
	var screen: AllianceScreen = pair[0]
	screen.tick(1000)
	assert_eq(screen._help_rows.get_child_count(), 2)
	screen.tick(60_000)
	assert_eq(screen._help_rows.get_child_count(), 1, "the one that ended is gone")
	pair[1].help = [_help_request("a", 100_000, false, true, 1)]
	screen.tick(61_000)
	assert_true(_buttons(screen._help_rows, Loc.t("help.give"))[0].disabled, "helped now")
