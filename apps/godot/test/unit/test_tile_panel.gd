extends GutTest
## TilePanel: hidden until a tile is shown, one sheet per kind, redrawn only when what it shows changes, closed by its button.

func _snap() -> Dictionary:
	# Seed 12345 lets a base or HQ stand on (20, 20) (map-fixtures.json baseSites).
	return {"size": 64, "terrainSeed": 12345, "bases": [{"tag": "AAAA", "x": 2, "y": 2, "mine": true, "alliance": null}], "hqs": [],
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

func _snap_with_rallies(rallies: Array) -> Dictionary:
	var snap := _snap()
	snap["rallies"] = rallies
	snap["npcs"].append({"id": "n4", "kind": "fortified_line", "level": 4, "x": 11, "y": 8, "region": 1})
	return snap

func _rally(id: String, npc: String, extra := {}) -> Dictionary:
	var r := {"id": id, "leader": "L", "target": {"npcId": npc, "kind": "patrol", "level": 1, "x": 8, "y": 8}, "gatherUntil": 10000.0, "arriveAt": 20000.0,
		"returnAt": 30000.0, "participants": 1, "maxParticipants": 5, "joined": false}
	r.merge(extra, true)
	return r

func test_start_rally_is_for_every_target_but_only_for_ranks_that_may_start_one() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	var snap := _snap_with_rallies([])
	for rank in ["leader", "officer"]:
		for tile in [Vector2i(8, 8), Vector2i(11, 8)]:
			panel.show_tile(tile)
			panel.update_view(snap, "plain", "Wolves", rank, 0.0)
			assert_true(_buttons(panel).has(Loc.t("rally.start")), "%s at %s" % [rank, tile])
	panel.show_tile(Vector2i(11, 8))
	panel.update_view(snap, "plain", "Wolves", "member", 0.0)
	assert_false(_buttons(panel).has(Loc.t("rally.start")))
	assert_true(_buttons(panel).size() == 1, "a member at a rally-only target has only the close button")
	panel.show_tile(Vector2i(2, 2))
	panel.update_view(snap, "plain", "Wolves", "leader", 0.0)
	assert_false(_buttons(panel).has(Loc.t("rally.start")), "not on your own camp")

func test_a_join_button_per_open_rally_and_it_asks_for_that_rally() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	var asked: Array = []
	panel.rally_join_requested.connect(func(_npc: Dictionary, r: Dictionary) -> void: asked.append(r["id"]))
	var snap := _snap_with_rallies([_rally("a", "n1"), _rally("b", "n1", {"joined": true}), _rally("c", "n1", {"gatherUntil": 100.0}), _rally("d", "n4")])
	panel.show_tile(Vector2i(8, 8))
	panel.update_view(snap, "plain", "Wolves", "member", 500.0)
	var joins: Array = panel.find_children("*", "Button", true, false).filter(func(b: Button) -> bool: return b.text == Loc.t("rally.join"))
	assert_eq(joins.size(), 1, "only the rally still gathering that you are not in")
	joins[0].pressed.emit()
	assert_eq(asked, ["a"])

func test_the_join_button_goes_when_the_gathering_ends_without_a_new_snapshot() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	var snap := _snap_with_rallies([_rally("a", "n1")])
	panel.show_tile(Vector2i(8, 8))
	panel.update_view(snap, "plain", "", "member", 9999.0)
	assert_true(_buttons(panel).has(Loc.t("rally.join")))
	panel.update_view(snap, "plain", "", "member", 10000.0)
	assert_false(_buttons(panel).has(Loc.t("rally.join")))

func test_the_leader_sees_place_hq_on_land_and_move_hq_once_it_stands() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	var asked: Array = []
	panel.hq_requested.connect(func(t: Vector2i) -> void: asked.append(t))
	var snap := _snap()
	snap["hqs"] = []
	panel.show_tile(Vector2i(20, 20))
	panel.update_view(snap, "plain", "Wolves", "leader", 0.0)
	assert_true(_buttons(panel).has(Loc.t("map.placeHq")))
	for b: Button in panel.find_children("*", "Button", true, false):
		if b.text == Loc.t("map.placeHq"):
			b.pressed.emit()
	assert_eq(asked, [Vector2i(20, 20)])
	panel.show_tile(Vector2i(1, 20))
	panel.update_view(snap, "plain", "Wolves", "leader", 0.0)
	assert_false(_buttons(panel).has(Loc.t("map.placeHq")), "no HQ button by the frontier")
	panel.show_tile(Vector2i(20, 20))
	snap["hqs"] = [{"tag": "WLF", "x": 4, "y": 4, "mine": true}]
	panel.update_view(snap, "plain", "Wolves", "leader", 0.0)
	assert_true(_buttons(panel).has(Loc.t("map.moveHq")))
	assert_false(_buttons(panel).has(Loc.t("map.placeHq")))

func test_no_hq_button_for_other_ranks_and_not_off_land() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	var snap := _snap()
	snap["hqs"] = []
	for rank in ["officer", "member", ""]:
		panel.show_tile(Vector2i(20, 20))
		panel.update_view(snap, "plain", "", rank, 0.0)
		assert_false(_buttons(panel).has(Loc.t("map.placeHq")), rank)
	panel.show_tile(Vector2i(8, 8))
	panel.update_view(snap, "plain", "Wolves", "leader", 0.0)
	assert_false(_buttons(panel).has(Loc.t("map.placeHq")), "not on a target")
	panel.show_tile(Vector2i(2, 2))
	panel.update_view(snap, "plain", "Wolves", "leader", 0.0)
	assert_false(_buttons(panel).has(Loc.t("map.placeHq")), "not on your own camp")
	snap["hqs"] = [{"tag": "WLF", "x": 4, "y": 4, "mine": true}]
	panel.show_tile(Vector2i(4, 4))
	panel.update_view(snap, "plain", "Wolves", "leader", 0.0)
	assert_false(_buttons(panel).has(Loc.t("map.placeHq")) or _buttons(panel).has(Loc.t("map.moveHq")), "not on the HQ itself")

func test_a_refusal_shows_under_the_button_and_goes_with_the_next_tile() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	var snap := _snap()
	snap["hqs"] = []
	panel.show_tile(Vector2i(20, 20))
	panel.update_view(snap, "plain", "Wolves", "leader", 0.0)
	panel.show_notice("tile_taken")
	panel.update_view(snap, "plain", "Wolves", "leader", 0.0)
	var texts: Array = panel.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)
	assert_true(texts.has(Loc.t("reason.tile_taken")))
	panel.show_tile(Vector2i(21, 20))
	panel.update_view(snap, "plain", "Wolves", "leader", 0.0)
	texts = panel.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)
	assert_false(texts.has(Loc.t("reason.tile_taken")))

func test_every_kind_has_its_icon_and_fits_a_phone() -> void:
	var name := "The Very Long Alliance N"
	var snap := _snap_with_rallies([_rally("a", "n1"), _rally("b", "n1")])
	snap["bases"].append({"tag": "BBBB", "x": 3, "y": 3, "mine": false, "alliance": name})
	snap["hqs"] = [{"tag": "WLF", "x": 4, "y": 4, "mine": true}]
	snap["sites"] = [{"id": "farmland:0", "kind": "farmland", "level": 3, "x": 5, "y": 5, "occupied": false, "mine": false}]
	var want := {Vector2i(2, 2): "base", Vector2i(3, 3): "avatar", Vector2i(4, 4): "alliance", Vector2i(8, 8): "npc_patrol", Vector2i(11, 8): "npc_fortified_line", Vector2i(5, 5): "food", Vector2i(20, 20): "map"}
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		for tile: Vector2i in want:
			var panel: TilePanel = add_child_autofree(TilePanel.new())
			panel.size = Vector2(1048, 0)
			panel.show_tile(tile)
			panel.update_view(snap, "plain", name, "leader", 0.0)
			panel.show_notice("tile_taken")
			panel.update_view(snap, "plain", name, "leader", 0.0)
			await wait_process_frames(3)
			assert_eq((panel.find_children("*", "HudIcon", true, false) + panel.find_children("*", "TextureRect", true, false))[0].get("icon_name"), want[tile])
			assert_lte(panel.get_combined_minimum_size().x, 1048.0, "%s %s" % [lang, tile])
			assert_lte(panel.size.y, 1400.0, "it stays under the top bar: %s %s" % [lang, tile])

func test_a_target_lists_its_defenders_without_the_ones_there_are_none_of() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	panel.show_tile(Vector2i(8, 8))
	panel.update_view(_snap(), "plain", "")
	var icons: Array = panel.find_children("*", "TextureRect", true, false).map(func(i: HudIcon) -> String: return i.icon_name)
	assert_has(icons, "troop_infantry")
	assert_does_not_have(icons, "troop_heavy")

func test_a_site_has_its_yield_rate_and_holder() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	var snap := _snap()
	snap["sites"] = [{"id": "farmland:0", "kind": "farmland", "level": 1, "x": 5, "y": 5, "occupied": false, "mine": false}]
	panel.show_tile(Vector2i(5, 5))
	panel.update_view(snap, "plain", "")
	for text in [Loc.t("harvest.resourceLine", {"resource": Loc.t("resource.food")}), Loc.t("harvest.rateLine", {"rate": "300"}), Loc.t("harvest.free")]:
		assert_has(_texts(panel), text)
	assert_true(_buttons(panel).has(Loc.t("harvest.button")))

func test_a_real_tap_on_send_march_asks_for_the_sheet_and_on_the_cross_closes() -> void:
	var panel: TilePanel = add_child_autofree(TilePanel.new())
	panel.size = Vector2(1048, 0)
	panel.show_tile(Vector2i(8, 8))
	panel.update_view(_snap(), "plain", "Wolves", "leader", 0.0)
	await wait_process_frames(3)
	watch_signals(panel)
	for b: Button in panel.find_children("*", "Button", true, false):
		await _tap(b)
	assert_signal_emit_count(panel, "march_requested", 1)
	assert_signal_emit_count(panel, "rally_start_requested", 1)
	assert_signal_emit_count(panel, "closed", 1)

func _tap(on: Control) -> void:
	var at := on.get_global_rect().get_center()
	for down in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = down
		event.position = at
		event.global_position = at
		get_viewport().push_input(event, true)
		await wait_process_frames(2)

func after_each() -> void:
	TranslationServer.set_locale("en")
