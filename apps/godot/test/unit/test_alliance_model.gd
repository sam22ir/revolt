extends GutTest
## AllianceModel: the unread rules (as alliance-store.ts), the search rows, the leave plan and the form values.

func _line(id: int, handle := "other") -> Dictionary:
	return {"id": id, "at": 1, "handle": handle, "rank": "member", "text": "t"}

func _view(rank: String, members: int) -> Dictionary:
	var list := []
	for i in members:
		list.append({"handle": "m%d" % i, "rank": "member", "me": i == 0})
	return {"id": "a1", "name": "Wolves", "tag": "WLF", "myRank": rank, "members": list, "maxMembers": 30}

func test_my_handle_is_the_member_marked_me() -> void:
	assert_eq(AllianceModel.my_handle(_view("member", 3)), "m0")
	assert_eq(AllianceModel.my_handle(null), "")
	assert_eq(AllianceModel.my_handle({"members": []}), "")

func test_unread_counts_lines_above_seen_from_others() -> void:
	var chat := [_line(1), _line(2, "me"), _line(3), _line(4)]
	assert_eq(AllianceModel.unread(chat, 1, "me"), 2, "own lines never count")
	assert_eq(AllianceModel.unread(chat, 4, "me"), 0)
	assert_eq(AllianceModel.unread(chat, 0, "me"), 3)
	assert_eq(AllianceModel.top_id(chat), 4)
	assert_eq(AllianceModel.top_id([]), 0)

func test_search_rows_offer_join_below_the_cap_only() -> void:
	var rows := AllianceModel.search_rows([
		{"id": "a", "name": "A", "tag": "AA", "members": 29, "maxMembers": 30},
		{"id": "b", "name": "B", "tag": "BB", "members": 30, "maxMembers": 30}, "junk"])
	assert_eq(rows.size(), 2, "a malformed entry is dropped")
	assert_true(rows[0]["can_join"])
	assert_false(rows[1]["can_join"])
	assert_eq(rows[0]["count_vars"], {"count": 29, "max": 30})

func test_leave_plan() -> void:
	assert_eq(AllianceModel.leave_plan(_view("member", 5)), {"kind": "confirm", "key": "alliance.confirmLeave"})
	assert_eq(AllianceModel.leave_plan(_view("officer", 5)), {"kind": "confirm", "key": "alliance.confirmLeave"})
	assert_eq(AllianceModel.leave_plan(_view("leader", 5)), {"kind": "blocked", "reason": "leader_must_transfer"})
	assert_eq(AllianceModel.leave_plan(_view("leader", 1)), {"kind": "confirm", "key": "alliance.confirmDisband"})

func test_form_values_are_trimmed_and_the_tag_upper_cased() -> void:
	assert_eq(AllianceModel.create_values("  Wolves ", " wlf "), {"name": "Wolves", "tag": "WLF"})
	assert_eq(AllianceModel.chat_text("  hi  "), "hi")
	assert_eq(AllianceModel.chat_text("   "), "")

func test_member_actions_match_the_client_for_every_rank() -> void:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/alliance-fixtures.json")), OK)
	var cases: Array = parsed.data["member_actions"]
	assert_eq(cases.size(), 18)
	for c: Dictionary in cases:
		var got := AllianceModel.member_actions(c["viewer"], {"rank": c["rank"], "me": c["me"]})
		assert_eq(got, c["actions"], "%s on %s (me=%s)" % [c["viewer"], c["rank"], c["me"]])

func test_confirm_text_names_the_member_for_kick_and_hand_over() -> void:
	assert_eq(AllianceModel.confirm_text({"kind": "kick", "handle": "Z"}), {"key": "alliance.confirmKick", "vars": {"handle": "Z"}})
	assert_eq(AllianceModel.confirm_text({"kind": "transfer", "handle": "Z"}), {"key": "alliance.confirmTransfer", "vars": {"handle": "Z"}})
	assert_eq(AllianceModel.confirm_text({"kind": "leave", "key": "alliance.confirmDisband"}), {"key": "alliance.confirmDisband", "vars": {}})
