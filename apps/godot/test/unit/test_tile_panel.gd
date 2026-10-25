extends GutTest
## TilePanel: hidden until a tile is shown, one sheet per kind, redrawn only when what it shows changes, closed by its button.

func _snap() -> Dictionary:
	return {"bases": [{"tag": "AAAA", "x": 2, "y": 2, "mine": true, "alliance": null}], "hqs": [],
		"npcs": [{"id": "n1", "kind": "patrol", "level": 1, "x": 8, "y": 8, "region": 1}]}

func _texts(panel: TilePanel) -> Array:
	return panel.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func test_it_is_hidden_until_a_tile_is_shown_and_hides_again() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	assert_false(panel.visible)
	panel.show_tile(Vector2i(8, 8))
	assert_true(panel.visible)
	panel.hide_tile()
	assert_false(panel.visible)

func test_a_target_sheet_has_its_name_level_coordinates_and_defenders() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	panel.show_tile(Vector2i(8, 8))
	panel.update_view(_snap(), "plain", "")
	var texts := _texts(panel)
	assert_true(texts.has(Loc.t("npc.patrol.name")))
	assert_true(texts.has(Loc.t("panel.level", {"level": "1"})))
	assert_true(texts.has(Loc.t("map.coords", {"x": "8", "y": "8"})))
	assert_true(texts.any(func(t: String) -> bool: return t.begins_with(Loc.t("map.defenders"))))

func test_empty_land_names_its_terrain() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	panel.show_tile(Vector2i(20, 20))
	panel.update_view(_snap(), "forest", "")
	assert_true(_texts(panel).has(Loc.t("terrain.forest")))

func test_it_redraws_only_when_what_it_shows_changes() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	panel.show_tile(Vector2i(8, 8))
	panel.update_view(_snap(), "plain", "")
	var first: Node = panel._body.get_child(0)
	panel.update_view(_snap(), "plain", "")
	assert_same(panel._body.get_child(0), first, "the same snapshot does not rebuild the sheet")
	var gone := _snap()
	gone["npcs"] = []
	panel.update_view(gone, "plain", "")
	assert_true(_texts(panel).has(Loc.t("terrain.plain")), "a defeated target's tile turns into land on the next snapshot")

func test_the_close_button_announces_closed() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	watch_signals(panel)
	panel.show_tile(Vector2i(2, 2))
	panel.update_view(_snap(), "plain", "")
	var close: Array = panel.find_children("*", "Button", true, false)
	assert_eq(close.size(), 1, "your own camp has only the close button")
	close[0].pressed.emit()
	assert_signal_emitted(panel, "closed")

func test_the_panel_stops_input() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	assert_eq(panel.mouse_filter, Control.MOUSE_FILTER_STOP, "a press on the sheet never reaches the map")

func _buttons(panel: TilePanel) -> Array:
	return panel.find_children("*", "Button", true, false).map(func(b: Button) -> String: return b.text)

func test_a_target_has_a_send_march_button_that_asks_for_the_sheet() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	var asked: Array = []
	panel.march_requested.connect(func(npc: Dictionary) -> void: asked.append(npc))
	panel.show_tile(Vector2i(8, 8))
	panel.update_view(_snap(), "plain", "")
	assert_true(_buttons(panel).has(Loc.t("map.sendMarch")))
	for b: Button in panel.find_children("*", "Button", true, false):
		if b.text == Loc.t("map.sendMarch"):
			b.pressed.emit()
	assert_eq(asked.size(), 1)
	assert_eq(asked[0]["id"], "n1")

func test_a_rally_only_target_and_other_tiles_have_no_send_march_button() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	var snap := _snap()
	snap["npcs"].append({"id": "n4", "kind": "fortified_line", "level": 4, "x": 11, "y": 8, "region": 1})
	panel.show_tile(Vector2i(11, 8))
	panel.update_view(snap, "plain", "")
	assert_false(_buttons(panel).has(Loc.t("map.sendMarch")))
	panel.show_tile(Vector2i(2, 2))
	panel.update_view(snap, "plain", "")
	assert_false(_buttons(panel).has(Loc.t("map.sendMarch")))
