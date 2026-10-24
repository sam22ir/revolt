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
