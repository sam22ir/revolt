extends GutTest

func test_minimap_corners_and_round_trip() -> void:
	var w := 132.0
	assert_eq(MinimapMath.tile_to_minimap(64, 0, 0, w), Vector2(w / 2, 0), "top corner")
	assert_eq(MinimapMath.tile_to_minimap(64, 64, 64, w), Vector2(w / 2, w / 2), "bottom corner")
	assert_eq(MinimapMath.tile_to_minimap(64, 64, 0, w), Vector2(w, w / 4), "right corner")
	for t: Vector2i in [Vector2i(0, 0), Vector2i(63, 0), Vector2i(0, 63), Vector2i(63, 63), Vector2i(17, 42)]:
		var p := MinimapMath.tile_to_minimap(64, t.x + 0.5, t.y + 0.5, w)
		assert_eq(MinimapMath.minimap_to_tile(64, p, w), t, "round trip %s" % t)
	assert_eq(MinimapMath.minimap_to_tile(64, Vector2(1, 1), w), Vector2i(-1, -1), "outside the diamond")

func test_edge_arrow() -> void:
	var band := Rect2(0, 100, 400, 600)
	assert_eq(MinimapMath.edge_arrow(Vector2(200, 400), band, 20), {}, "inside: no arrow")
	var right := MinimapMath.edge_arrow(Vector2(2000, 400), band, 20)
	assert_almost_eq(right["at"].x, 380.0, 0.001)
	assert_almost_eq(right["at"].y, 400.0, 0.001)
	assert_almost_eq(right["angle"], 0.0, 0.001)
	var down := MinimapMath.edge_arrow(Vector2(200, 3000), band, 20)
	assert_almost_eq(down["at"].y, 680.0, 0.001)
	assert_almost_eq(down["angle"], PI / 2, 0.001)
	var pushed := MinimapMath.edge_arrow(Vector2(2000, 3000), band, 20, Rect2(300, 600, 100, 100))
	assert_eq(pushed["at"].y, 600.0, "moved up out of the minimap's corner")

func test_parse_coord() -> void:
	assert_eq(FindModel.parse_coord("12", 64), 12)
	assert_eq(FindModel.parse_coord(" 0 ", 64), 0)
	assert_eq(FindModel.parse_coord("63", 64), 63)
	assert_eq(FindModel.parse_coord("٤٢", 64), 42, "Arabic-Indic digits")
	assert_eq(FindModel.parse_coord("۷", 64), 7, "Persian digits")
	for bad in ["", "64", "-1", "3.5", "abc", "1 2", "99999999999"]:
		assert_eq(FindModel.parse_coord(bad, 64), -1, "refuses '%s'" % bad)

func test_match_camps() -> void:
	var bases := [{"tag": "7F6QZG", "x": 1, "y": 1}, {"tag": "QZ2ABC", "x": 2, "y": 2}, {"tag": "AQZ999", "x": 3, "y": 3}, {"tag": "QZ", "x": 4, "y": 4}]
	assert_eq(FindModel.match_camps(bases, "qz").map(func(b: Dictionary) -> String: return b["tag"]), ["QZ", "QZ2ABC", "7F6QZG", "AQZ999"])
	assert_eq(FindModel.match_camps(bases, "  "), [])
	assert_eq(FindModel.match_camps(bases, "ZZZ"), [])
	var many: Array = []
	for i in 9:
		many.append({"tag": "AB%d" % i, "x": i, "y": i})
	assert_eq(FindModel.match_camps(many, "ab").size(), FindModel.MAX_CAMPS)

func test_targets_of_level_nearest_first() -> void:
	var npcs := [{"id": "a", "level": 2, "x": 30, "y": 30}, {"id": "b", "level": 2, "x": 11, "y": 10}, {"id": "c", "level": 1, "x": 10, "y": 10}, {"id": "d", "level": 2, "x": 10, "y": 11}]
	assert_eq(FindModel.targets_of_level(npcs, 2, Vector2i(10, 10)).map(func(n: Dictionary) -> String: return n["id"]), ["b", "d", "a"])
	assert_eq(FindModel.targets_of_level(npcs, 4, Vector2i(10, 10)), [])

func _snap() -> Dictionary:
	return {"terrainSeed": 12345, "size": 64, "liberations": [], "hqs": [],
		"bases": [{"tag": "7F6QZG", "x": 30, "y": 31, "mine": true, "alliance": null}, {"tag": "QZ2ABC", "x": 5, "y": 9, "mine": false, "alliance": null}],
		"npcs": [{"id": "n1", "kind": "patrol", "level": 1, "x": 40, "y": 40}, {"id": "n2", "kind": "patrol", "level": 1, "x": 12, "y": 12}]}

func _buttons(root: Node) -> Array:
	return root.find_children("*", "Button", true, false)

func test_the_find_sheet_goes_to_coordinates_and_refuses_bad_ones() -> void:
	var sheet: FindSheet = add_child_autofree(FindSheet.new())
	var asked: Array = []
	sheet.go.connect(func(t: Vector2i) -> void: asked.append(t))
	sheet.open(_snap(), Vector2i(10, 10))
	var fields: Array = sheet.find_children("*", "LineEdit", true, false)
	(fields[0] as LineEdit).text = "٤٢"
	(fields[1] as LineEdit).text = "7"
	for b: Button in _buttons(sheet):
		if b.text == Loc.t("map.goTo"):
			b.pressed.emit()
	assert_eq(asked, [Vector2i(42, 7)])
	(fields[1] as LineEdit).text = "64"
	for b: Button in _buttons(sheet):
		if b.text == Loc.t("map.goTo"):
			b.pressed.emit()
	assert_eq(asked.size(), 1, "64 is off the map")
	var notes: Array = sheet.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)
	assert_true(notes.has(Loc.t("map.badCoords", {"max": Fmt.amount(Fmt.lang(), 63)})))

func test_the_find_sheet_walks_targets_outward_and_finds_camps() -> void:
	var sheet: FindSheet = add_child_autofree(FindSheet.new())
	var asked: Array = []
	sheet.go.connect(func(t: Vector2i) -> void: asked.append(t))
	sheet.open(_snap(), Vector2i(10, 10))
	var level1 := Loc.t("search.level", {"level": Fmt.amount(Fmt.lang(), 1)})
	for i in 3:
		for b: Button in _buttons(sheet):
			if b.text == level1:
				b.pressed.emit()
	assert_eq(asked, [Vector2i(12, 12), Vector2i(40, 40), Vector2i(12, 12)], "nearest first, then Next, then round again")
	var tag: LineEdit = sheet.find_children("*", "LineEdit", true, false)[2]
	tag.text = "qz2"
	tag.text_changed.emit("qz2")
	await wait_process_frames(1)
	var camp_buttons := _buttons(sheet).filter(func(b: Button) -> bool: return b.text.begins_with("QZ2ABC"))
	assert_eq(camp_buttons.size(), 1)
	camp_buttons[0].pressed.emit()
	assert_eq(asked.back(), Vector2i(5, 9))

func test_the_minimap_jumps_to_the_tile_tapped() -> void:
	var m: Minimap = add_child_autofree(Minimap.new())
	m.size = m.custom_minimum_size
	m.set_snapshot(_snap(), 10)
	var asked: Array = []
	m.jump.connect(func(t: Vector2i) -> void: asked.append(t))
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = MinimapMath.tile_to_minimap(64, 20.5, 33.5, m.width_px())
	m._gui_input(press)
	press.position = Vector2(1, 1)
	m._gui_input(press)
	assert_eq(asked, [Vector2i(20, 33)], "outside the diamond does nothing")
