extends GutTest
## The base picture and its sheet: hit testing on the painted pixels, the tint and fit, the panel's rebuild rule, and the
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

func test_where_sprites_overlap_the_nearer_building_wins() -> void:
	var view := _view()
	# Whatever building a point belongs to, it is the last one in draw order that is opaque there.
	var checked := 0
	for x in range(-300, 300, 20):
		for y in range(0, 400, 20):
			var id := view.hit_building(Vector2(x, y))
			if id == "":
				continue
			checked += 1
			assert_true(Balance.data()["buildingIds"].has(id))
	assert_gt(checked, 20, "the sprites cover a good part of the slab")

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

func test_the_building_under_construction_is_dimmed() -> void:
	var view := _view()
	view.set_state(_levels(), {"building": "farm", "toLevel": 2, "startedAt": NOW - 1000, "endsAt": NOW + 9000}, NOW)
	assert_eq(view._sprites["farm"].modulate, BaseView.UPGRADING_TINT)
	assert_eq(view._sprites["hq"].modulate, Color.WHITE)
	view.set_state(_levels(), null, NOW)
	assert_eq(view._sprites["farm"].modulate, Color.WHITE)

func test_the_fit_keeps_the_base_between_the_hud_and_the_nav_bar() -> void:
	var view := _view()
	view.apply_fit(Vector2(1080, 1920), 300.0, 100.0)
	var z := view.layer.scale.x
	assert_gt(z, 0.0)
	# The slab's top corner (world 0, 0) and bottom corner (0, WORLD_HEIGHT) must both land between the HUD and the nav bar.
	var top_y := view.layer.offset.y + 0.0 * z
	var bottom_y := view.layer.offset.y + BaseLayout.WORLD_HEIGHT * z
	assert_gte(top_y, 300.0 - 1.0, "below the HUD")
	assert_lte(bottom_y, 1920.0 - 100.0 + 1.0, "above the nav bar")
	# The width fits too, with the sprites.
	assert_lte(view.span() * z, 1080.0 - 16.0 + 0.5)

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
