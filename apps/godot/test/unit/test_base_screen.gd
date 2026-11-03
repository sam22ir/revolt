extends GutTest
## The base picture and its sheet: hit testing on the traced outlines, the shade, fit and pan, the panel's rebuild rule, and the
## upgrade request with a fake API.

class FakeApi:
	extends RefCounted
	var token := "t"
	var posted: Array = []
	var reply: Dictionary = {"ok": true, "status": 200, "data": null}
	func get_json(_path: String) -> Dictionary:
		await (Engine.get_main_loop() as SceneTree).process_frame
		return reply
	func post_json(_path: String, body: Variant = {}) -> Dictionary:
		posted.append(body)
		await (Engine.get_main_loop() as SceneTree).process_frame
		return reply

const NOW := 5_000_000

func after_each() -> void:
	TranslationServer.set_locale("en")

func _levels(over: Dictionary = {}) -> Dictionary:
	var l := {"hq": 3, "farm": 1, "armory": 1, "treasury": 1, "barracks": 1, "hero_hall": 1}
	l.merge(over, true)
	return l

func _state(levels: Dictionary, queue: Variant = null) -> Dictionary:
	return {"resources": {"food": 9999, "materiel": 9999, "funds": 9999, "support": 9999}, "levels": levels, "lastUpdated": NOW, "queue": queue}

func _view() -> BaseView:
	var layer := CanvasLayer.new()
	add_child_autofree(layer)
	var view := BaseView.new()
	view.layer = layer
	layer.add_child(view)
	view.build()
	return view

func test_a_point_on_each_building_hits_that_building_and_empty_ground_hits_nothing() -> void:
	var view := _view()
	for id: String in Balance.data()["buildingIds"]:
		assert_eq(view.hit_building(view.building_point(id)), id, "the walls of " + id)
	assert_eq(view.hit_building(Vector2(0, -300)), "", "above the base")
	assert_eq(view.hit_building(Vector2(-900, 100)), "", "far to the side")

func test_every_building_has_one_outline_and_no_two_overlap() -> void:
	var ids: Array = Balance.data()["buildingIds"]
	assert_eq(CampLayout.REGIONS.size(), ids.size())
	for id: String in ids:
		assert_true(CampLayout.REGIONS.has(id), id)
		assert_true(Geometry2D.is_point_in_polygon(CampLayout.REGIONS[id]["point"], CampLayout.outline(id)), id + " point is inside")
	for i in ids.size():
		for j in range(i + 1, ids.size()):
			assert_eq(Geometry2D.intersect_polygons(CampLayout.outline(ids[i]), CampLayout.outline(ids[j])).size(), 0, "%s and %s" % [ids[i], ids[j]])

func test_outlines_and_names_are_on_the_painting() -> void:
	var world := Rect2(Vector2.ZERO, CampLayout.WORLD)
	for id: String in CampLayout.REGIONS:
		assert_true(world.has_point(CampLayout.REGIONS[id]["label"]), id)
		for at: Vector2 in CampLayout.outline(id):
			assert_true(world.has_point(at), id)

func test_taps_are_reported_in_world_coordinates() -> void:
	var view := _view()
	var tapped := []
	var ground := [0]
	view.building_tapped.connect(func(id: String) -> void: tapped.append(id))
	view.ground_tapped.connect(func() -> void: ground[0] += 1)
	view.layer.scale = Vector2(0.5, 0.5)
	view.layer.offset = Vector2(300, 200)
	var screen := view.get_global_transform_with_canvas() * view.building_point("hq")
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = screen
	view._unhandled_input(press)
	var release := press.duplicate() as InputEventMouseButton
	release.pressed = false
	view._unhandled_input(release)
	assert_eq(tapped, ["hq"], "the layer's fit does not move the hit")
	press.position = Vector2(5, 5)
	release.position = Vector2(5, 5)
	view._unhandled_input(press)
	view._unhandled_input(release)
	assert_eq(ground[0], 1, "a tap on empty ground deselects")

func test_a_drag_is_not_a_tap() -> void:
	var view := _view()
	var tapped := []
	view.building_tapped.connect(func(id: String) -> void: tapped.append(id))
	var at := view.get_global_transform_with_canvas() * view.building_point("hq")
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = at
	view._unhandled_input(press)
	var release := press.duplicate() as InputEventMouseButton
	release.pressed = false
	release.position = at + Vector2(80, 0)
	view._unhandled_input(release)
	assert_eq(tapped, [])

func _press_at(view: BaseView, at: Vector2, pressed: bool) -> void:
	var e := InputEventMouseButton.new()
	e.button_index = MOUSE_BUTTON_LEFT
	e.pressed = pressed
	e.position = at
	view._unhandled_input(e)

func _drag_by(view: BaseView, from: Vector2, by: Vector2) -> void:
	var e := InputEventMouseMotion.new()
	e.position = from + by
	e.relative = by
	view._unhandled_input(e)

func test_the_building_under_construction_is_shaded() -> void:
	var view := _view()
	view.set_state(_levels(), {"building": "farm", "toLevel": 2, "startedAt": NOW - 1000, "endsAt": NOW + 9000}, NOW)
	assert_true(view.is_shaded("farm"))
	assert_false(view.is_shaded("hq"))
	view.set_state(_levels(), null, NOW)
	assert_false(view.is_shaded("farm"))

func test_each_building_shows_its_name_and_level_in_the_language() -> void:
	var view := _view()
	view.set_state(_levels({"hq": 7}), null, NOW)
	var en: String = view._labels["hq"].text
	assert_string_contains(en, Loc.t("building.hq.name"))
	assert_string_contains(en, Fmt.amount("en", 7))
	TranslationServer.set_locale("ar")
	view.set_state(_levels({"hq": 7}), null, NOW)
	assert_ne(view._labels["hq"].text, en)

## A building's bounds on screen at the layer's current fit.
func _screen_bounds(view: BaseView, id: String) -> Rect2:
	var shape := CampLayout.outline(id)
	var box := Rect2(shape[0], Vector2.ZERO)
	for at in shape:
		box = box.expand(at)
	return Rect2(view.layer.offset + box.position * view.layer.scale, box.size * view.layer.scale)

## HUD sizes close to the real ones: the top box and HudBottom.HEIGHT.
const HUD_TOP := 300.0
const HUD_NAV := 252.0

func test_the_painting_always_covers_the_space_between_the_hud_and_the_nav_bar() -> void:
	for view_size: Vector2 in [Vector2(1080, 1920), Vector2(1080, 2340), Vector2(1080, 2400), Vector2(1080, 2640), Vector2(1080, 1440)]:
		var f := CampLayout.fit(view_size, HUD_TOP, HUD_NAV)
		var size := CampLayout.WORLD * float(f["zoom"])
		for offset: Vector2 in [f["start"], f["low"], f["high"]]:
			assert_lte(offset.x, 0.001, "left edge at %s" % view_size)
			assert_gte(offset.x + size.x, view_size.x - 0.001, "right edge at %s" % view_size)
			assert_lte(offset.y, HUD_TOP + 0.001, "under the HUD at %s" % view_size)
			assert_gte(offset.y + size.y, view_size.y - HUD_NAV - 0.001, "behind the nav bar at %s" % view_size)

func test_on_tall_phones_every_building_opens_clear_of_the_hud() -> void:
	for view_size: Vector2 in [Vector2(1080, 2340), Vector2(1080, 2400)]:
		var view := _view()
		view.apply_fit(view_size, HUD_TOP, HUD_NAV)
		for id: String in CampLayout.REGIONS:
			var box := _screen_bounds(view, id)
			assert_gte(box.position.y, HUD_TOP, "%s under the top at %s" % [id, view_size])
			assert_lte(box.end.y, view_size.y - HUD_NAV, "%s above the nav at %s" % [id, view_size])
			assert_gte(box.position.x, 0.0, "%s on screen at %s" % [id, view_size])
			assert_lte(box.end.x, view_size.x, "%s on screen at %s" % [id, view_size])

func test_on_a_16_by_9_phone_the_camp_opens_on_the_command_post_and_panning_reaches_the_farm() -> void:
	var view_size := Vector2(1080, 1920)
	var view := _view()
	view.apply_fit(view_size, HUD_TOP, HUD_NAV)
	assert_gte(_screen_bounds(view, "hq").position.y, HUD_TOP, "the command post is clear of the top")
	var at := Vector2(500, 900)
	_press_at(view, at, true)
	_drag_by(view, at, Vector2(0, -2000))
	_press_at(view, at + Vector2(0, -2000), false)
	assert_lte(_screen_bounds(view, "farm").end.y, view_size.y - HUD_NAV, "the farm comes clear of the nav bar")

func test_panning_stops_at_the_edges_and_a_refit_keeps_the_place() -> void:
	var view := _view()
	view.apply_fit(Vector2(1080, 1920), HUD_TOP, HUD_NAV)
	var start := view.layer.offset
	_press_at(view, Vector2(500, 900), true)
	_drag_by(view, Vector2(500, 900), Vector2(0, 5000))
	assert_eq(view.layer.offset, start, "already at the top of the painting")
	_drag_by(view, Vector2(500, 900), Vector2(0, -100))
	_press_at(view, Vector2(500, 800), false)
	var panned := view.layer.offset
	assert_lt(panned.y, start.y)
	view.apply_fit(Vector2(1080, 1920), HUD_TOP, HUD_NAV)
	assert_eq(view.layer.offset, panned)

func test_a_drag_with_motion_that_returns_to_its_start_is_not_a_tap() -> void:
	var view := _view()
	view.apply_fit(Vector2(1080, 1920), HUD_TOP, HUD_NAV)
	var tapped := []
	view.building_tapped.connect(func(id: String) -> void: tapped.append(id))
	view.ground_tapped.connect(func() -> void: tapped.append("ground"))
	var at := view.get_global_transform_with_canvas() * view.building_point("hq")
	_press_at(view, at, true)
	_drag_by(view, at, Vector2(0, -60))
	_drag_by(view, at + Vector2(0, -60), Vector2(0, 60))
	_press_at(view, at, false)
	assert_eq(tapped, [])

func _panel() -> BuildingPanel:
	var panel := BuildingPanel.new()
	add_child_autofree(panel)
	return panel

func test_the_panel_rebuilds_only_when_the_structure_changes() -> void:
	var panel := _panel()
	panel.open_for("farm")
	var job := {"building": "farm", "toLevel": 2, "startedAt": NOW - 10_000, "endsAt": NOW + 20_000}
	panel.update_model(BuildingPanelModel.build("farm", _levels(), {"food": 9999.0, "materiel": 9999.0, "funds": 9999.0, "support": 0.0}, job, NOW), "")
	var first_child := panel._body.get_child(0)
	var countdown_before := panel._countdown.text
	panel.update_model(BuildingPanelModel.build("farm", _levels(), {"food": 9999.0, "materiel": 9999.0, "funds": 9999.0, "support": 0.0}, job, NOW + 5000), "")
	assert_same(panel._body.get_child(0), first_child, "no rebuild while only the clock moved")
	assert_ne(panel._countdown.text, countdown_before, "the countdown ticked")
	assert_eq(panel._countdown.text, Fmt.duration(15_000))

func test_the_panel_follows_the_language() -> void:
	var panel := _panel()
	panel.open_for("farm")
	var model := BuildingPanelModel.build("farm", _levels(), {"food": 9999.0, "materiel": 9999.0, "funds": 9999.0, "support": 0.0}, null, NOW)
	panel.update_model(model, "")
	var title_en := (panel._body.get_child(0).get_child(0) as Label).text
	TranslationServer.set_locale("ar")
	panel.update_model(model, "")
	var title_ar := (panel._body.get_child(0).get_child(0) as Label).text
	assert_ne(title_en, title_ar, "the sheet is rebuilt in Arabic")

func _screen(api: FakeApi, state: Dictionary) -> BaseScreen:
	var session := Session.new(api, Clock.new())
	session.apply({"state": state, "now": NOW})
	var screen := BaseScreen.new()
	screen.setup(session)
	add_child_autofree(screen)
	screen.build()
	screen.add_child(screen.panel)
	return screen

func test_tapping_a_building_opens_its_sheet_and_ground_closes_it() -> void:
	var screen := _screen(FakeApi.new(), _state(_levels()))
	screen.view.building_tapped.emit("barracks")
	assert_eq(screen.panel.shown_id(), "barracks")
	assert_eq(screen.view.selected, "barracks")
	screen.view.ground_tapped.emit()
	assert_false(screen.panel.is_open())
	assert_eq(screen.view.selected, "")

func test_hiding_the_screen_closes_the_sheet() -> void:
	var screen := _screen(FakeApi.new(), _state(_levels()))
	screen.select("farm")
	screen.set_active(false)
	assert_false(screen.panel.is_open())
	assert_false(screen.layer.visible)

func test_the_upgrade_button_sends_the_intent_and_a_refusal_shows_its_reason() -> void:
	var api := FakeApi.new()
	api.reply = {"ok": true, "status": 200, "data": {"ok": false, "reason": "queue_busy", "state": _state(_levels()), "now": NOW + 1000}}
	var screen := _screen(api, _state(_levels()))
	screen.select("farm")
	screen.update(NOW, {"food": 9999.0, "materiel": 9999.0, "funds": 9999.0, "support": 0.0})
	screen.panel.upgrade_pressed.emit("farm")
	assert_true(screen.panel._pending, "off while the request is out")
	await wait_until(func() -> bool: return screen.panel._notice != "", 5.0)
	assert_eq(api.posted, [{"type": "upgrade", "building": "farm"}])
	assert_eq(screen.panel._notice, "queue_busy")
	assert_false(screen.panel._pending)

func test_an_accepted_upgrade_applies_the_state_the_server_returned() -> void:
	var api := FakeApi.new()
	var job := {"building": "farm", "toLevel": 2, "startedAt": NOW, "endsAt": NOW + 30_000}
	api.reply = {"ok": true, "status": 200, "data": {"ok": true, "state": _state(_levels(), job), "now": NOW + 10}}
	var screen := _screen(api, _state(_levels()))
	screen.select("farm")
	screen.panel.upgrade_pressed.emit("farm")
	await wait_until(func() -> bool: return screen._session.queue() != null, 5.0)
	assert_eq(screen._session.queue()["building"], "farm")
	assert_eq(screen.panel._notice, "", "no notice for an accepted upgrade")

func test_a_second_press_before_the_answer_sends_nothing() -> void:
	var api := FakeApi.new()
	api.reply = {"ok": true, "status": 200, "data": {"ok": true, "state": _state(_levels()), "now": NOW + 10}}
	var screen := _screen(api, _state(_levels()))
	screen.select("farm")
	screen.panel.upgrade_pressed.emit("farm")
	screen.panel.upgrade_pressed.emit("farm")
	screen.panel.upgrade_pressed.emit("farm")
	await wait_until(func() -> bool: return not screen.panel.is_pending(), 5.0)
	assert_eq(api.posted.size(), 1, "one intent for three presses")
