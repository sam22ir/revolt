extends GutTest
## The frame parsers drop whatever is not a well-formed server message and never throw (same rules as the client's
## parseMapMessage / parseAllianceMessage).

func _snapshot() -> Dictionary:
	return {"size": 64, "terrainSeed": 1, "now": 5, "bases": [], "npcs": [], "marches": []}

func _line(id: int = 1) -> Dictionary:
	return {"id": id, "at": 10, "handle": "ABC123", "rank": "member", "text": "hello"}

func test_map_frames() -> void:
	var map: Variant = MapMessages.parse(JSON.stringify({"type": "map", "snapshot": _snapshot()}))
	assert_eq(map["type"], "map")
	assert_eq(int(map["snapshot"]["size"]), 64)
	var report: Variant = MapMessages.parse('{"type":"report","report":{"id":"r1","at":3,"result":"win","target":{},"rounds":1,"sent":{},"survivors":{},"wounded":{},"lost":{},"defenders":{},"defendersKilled":{},"loot":{}}}')
	assert_eq(report["type"], "report")
	assert_eq(int(MapMessages.parse('{"type":"base_changed","now":9}')["now"]), 9)

func test_bad_map_frames_are_dropped() -> void:
	for text: String in ["", "nope", "[]", "3", '{"type":"nope"}', '{"type":"map"}', '{"type":"map","snapshot":{"size":64}}',
			'{"type":"report","report":{"id":1}}', '{"type":"base_changed"}', '{"type":"base_changed","now":"x"}']:
		assert_null(MapMessages.parse(text), "dropped: " + text)
	var bad := _snapshot()
	bad["bases"] = "none"
	assert_null(MapMessages.parse(JSON.stringify({"type": "map", "snapshot": bad})), "a snapshot whose bases are not a list")

func test_alliance_frames() -> void:
	var chat: Variant = AllianceMessages.parse(JSON.stringify({"type": "chat", "message": _line()}))
	assert_eq(chat["message"]["text"], "hello")
	for t in ["members_changed", "help_changed", "kicked"]:
		assert_eq(AllianceMessages.parse('{"type":"%s"}' % t)["type"], t)
	assert_eq(AllianceMessages.parse('{"type":"error","reason":"rate_limited"}')["reason"], "rate_limited")

func test_bad_alliance_frames_are_dropped() -> void:
	for text: String in ["", "nope", "[]", '{"type":"nope"}', '{"type":"chat"}', '{"type":"chat","message":{"id":1}}',
			'{"type":"error","reason":"other"}', '{"type":"history"}', '{"type":"history","messages":"x"}']:
		assert_null(AllianceMessages.parse(text), "dropped: " + text)
	var odd := _line()
	odd["rank"] = "king"
	assert_null(AllianceMessages.parse(JSON.stringify({"type": "chat", "message": odd})), "an unknown rank")

func test_bad_entries_in_a_history_are_dropped_one_by_one() -> void:
	var odd := _line(3)
	odd["text"] = 5
	var msg: Variant = AllianceMessages.parse(JSON.stringify({"type": "history", "messages": [_line(1), odd, "x", _line(2)]}))
	assert_eq(msg["messages"].size(), 2)
	assert_eq(int(msg["messages"][1]["id"]), 2)

func test_the_chat_frame_is_the_one_the_server_reads() -> void:
	var parsed := JSON.new()
	assert_eq(parsed.parse(AllianceMessages.chat_frame('hi "there"')), OK)
	assert_eq(parsed.data, {"type": "chat", "text": 'hi "there"'})
