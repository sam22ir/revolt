extends GutTest
## MarchesList and MarchMarkers: what the player's marches show over the map, set in place from the timestamps.

func _march(id: String, extra := {}) -> Dictionary:
	var m := {"id": id, "target": {"npcId": "n", "level": 1, "x": 32, "y": 53}, "from": {"x": 43, "y": 54}, "to": {"x": 32, "y": 53},
		"departAt": 1000.0, "arriveAt": 5000.0, "returnAt": 9000.0, "outcome": null}
	m.merge(extra, true)
	return m

func _texts(root: Node) -> Array:
	return root.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)

func test_it_is_hidden_with_no_marches() -> void:
	var list: MarchesList = add_child_autofree(MarchesList.new())
	list.update_view([], 0.0)
	assert_false(list.visible)

func test_a_march_shows_its_target_stage_and_countdown() -> void:
	var list: MarchesList = add_child_autofree(MarchesList.new())
	list.update_view([_march("a")], 2000.0)
	assert_true(list.visible)
	var texts := _texts(list)
	assert_true(texts.has(Loc.t("march.entry", {"name": Loc.t("npc.patrol.name"), "level": "1"})))
	assert_true(texts.has("%s · %s" % [Loc.t("march.phase.outbound"), Loc.t("march.arrivesIn", {"time": Fmt.duration(3000.0)})]))

func test_the_countdown_ticks_in_place_without_rebuilding() -> void:
	var list: MarchesList = add_child_autofree(MarchesList.new())
	list.update_view([_march("a")], 2000.0)
	var first: Node = list._body.get_child(0)
	list.update_view([_march("a")], 3000.0)
	assert_same(list._body.get_child(0), first)
	assert_true(_texts(list).has("%s · %s" % [Loc.t("march.phase.outbound"), Loc.t("march.arrivesIn", {"time": Fmt.duration(2000.0)})]))

func test_after_the_battle_the_result_leads_and_the_return_is_counted() -> void:
	var list: MarchesList = add_child_autofree(MarchesList.new())
	list.update_view([_march("a", {"outcome": {"result": "victory"}})], 6000.0)
	assert_true(_texts(list).has("%s · %s · %s" % [Loc.t("march.result.victory"), Loc.t("march.phase.returning"), Loc.t("march.returnsIn", {"time": Fmt.duration(3000.0)})]))

func test_a_march_waiting_on_its_battle_has_no_countdown() -> void:
	var list: MarchesList = add_child_autofree(MarchesList.new())
	list.update_view([_march("a")], 6000.0)
	assert_true(_texts(list).has(Loc.t("march.phase.fighting")))

func test_heroes_are_named_and_the_list_takes_no_input() -> void:
	var list: MarchesList = add_child_autofree(MarchesList.new())
	list.update_view([_march("a", {"heroes": {"lead": "mountain_guide", "deputies": [], "levels": {}}})], 2000.0)
	assert_true(_texts(list).has(Loc.t("march.ledBy", {"names": Loc.t("hero.mountain_guide.name")})))
	assert_eq(list.mouse_filter, Control.MOUSE_FILTER_IGNORE)

func _markers(marches: Array) -> MarchMarkers:
	var map: WorldMap = add_child_autofree(WorldMap.new())
	map.snapshot = {"marches": marches}
	var markers: MarchMarkers = add_child_autofree(MarchMarkers.new())
	markers.setup(map)
	return markers

func test_markers_draw_while_there_are_marches_and_stop_when_there_are_none() -> void:
	var m := _march("a", {"mine": true})
	var markers := _markers([m])
	markers.tick(2000.0, 1.0)
	await wait_frames(2)
	assert_gt(markers.draw_count, 0)
	markers.map.snapshot = {"marches": []}
	markers.tick(2000.0, 1.0)
	await wait_frames(2)
	var cleared := markers.draw_count
	markers.tick(3000.0, 1.0)
	await wait_frames(2)
	assert_eq(markers.draw_count, cleared, "with nothing to show it does not redraw")

func test_markers_do_nothing_without_a_snapshot() -> void:
	var markers: MarchMarkers = add_child_autofree(MarchMarkers.new())
	markers.tick(0.0, 1.0)
	await wait_frames(2)
	assert_eq(markers.draw_count, 0)

func test_a_malformed_march_on_the_wire_is_skipped_not_drawn() -> void:
	var markers := _markers([{"id": "x"}, "junk", {"id": "y", "from": {"x": 1, "y": 1}, "to": {"x": 2}, "departAt": 0, "arriveAt": 1, "returnAt": 2}, _march("ok", {"mine": true})])
	markers.tick(2000.0, 1.0)
	await wait_frames(2)
	assert_gt(markers.draw_count, 0, "the good march still draws and nothing crashes")

func test_it_hides_for_a_march_that_came_home_and_while_a_sheet_covers_it() -> void:
	var list: MarchesList = add_child_autofree(MarchesList.new())
	list.update_view([_march("a")], 2000.0)
	assert_true(list.visible)
	list.update_view([_march("a")], 2000.0, true)
	assert_false(list.visible, "covered by the march sheet")
	list.update_view([_march("a")], 2000.0)
	assert_true(list.visible)
	list.update_view([_march("a", {"outcome": {"result": "victory"}})], 9500.0)
	assert_false(list.visible, "home: past its return, though the base still lists it")

## The Recall button of a harvest at its site: shown only while it is recallable, pressing it asks for the march, a refusal shows as its
## reason.
func _harvest(extra := {}) -> Dictionary:
	var h := {"id": "h1", "siteId": "quarry:0", "from": {"x": 1, "y": 1}, "to": {"x": 2, "y": 2}, "departAt": 0.0, "arriveAt": 1000.0,
		"leaveSiteAt": 5000.0, "returnAt": 7000.0, "outcome": null}
	h.merge(extra, true)
	return h

func _recall_buttons(list: MarchesList) -> Array:
	return list.find_children("*", "Button", true, false).filter(func(b: Button) -> bool: return b.text == Loc.t("harvest.recall"))

func test_a_harvest_at_its_site_shows_recall_and_its_time_left() -> void:
	var list: MarchesList = add_child_autofree(MarchesList.new())
	list.update_view([_harvest()], 3000.0)
	var buttons := _recall_buttons(list)
	assert_eq(buttons.size(), 1)
	assert_true(buttons[0].visible)
	assert_true(_texts(list).has("%s · %s" % [Loc.t("march.phase.at_site"), Loc.t("march.leavesSiteIn", {"time": Fmt.duration(2000.0)})]))

func test_recall_is_hidden_on_the_way_out_and_after_the_leave_time() -> void:
	var list: MarchesList = add_child_autofree(MarchesList.new())
	list.update_view([_harvest()], 500.0)
	assert_false(_recall_buttons(list)[0].visible, "outbound")
	list.update_view([_harvest()], 6000.0)
	assert_false(_recall_buttons(list)[0].visible, "returning")

func test_pressing_recall_asks_for_that_march() -> void:
	var list: MarchesList = add_child_autofree(MarchesList.new())
	list.update_view([_harvest()], 3000.0)
	watch_signals(list)
	_recall_buttons(list)[0].pressed.emit()
	assert_signal_emitted_with_parameters(list, "recall_requested", ["h1"])

func test_a_refused_recall_shows_its_reason_until_cleared() -> void:
	var list: MarchesList = add_child_autofree(MarchesList.new())
	list.update_view([_harvest()], 3000.0)
	list.show_notice("already_leaving")
	list.update_view([_harvest()], 3000.0)
	assert_true(_texts(list).has(Loc.t("reason.already_leaving")))
	list.show_notice("")
	list.update_view([_harvest()], 3000.0)
	assert_false(_texts(list).has(Loc.t("reason.already_leaving")))
