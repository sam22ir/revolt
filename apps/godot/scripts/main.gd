extends Node
## The shell: guest session, the two screens (the base, and the world map with its camera), a small HUD and a bottom nav bar.
## The map (a Node2D tree) is never mirrored in Arabic; only the HUD controls follow the locale direction.

const FONT_SIZE := 34
## Room kept free at the bottom for the round buttons and the Base/Map switch, in viewport px; the base screen and the sheets keep clear of it.
const NAV_HEIGHT := HudBottom.HEIGHT
## How far past the map's bounds the camera may look, in world px.
const MAP_MARGIN := 480.0
## The screens that are pages opened from the bottom row (or Settings from the player chip); Base and Map are the two homes.
const PAGES: Array[String] = ["heroes", "alliance", "reports", "settings"]
## Gap between the top box and the report toast, in viewport px.
const TOAST_GAP := 8
## The building card's gap to the screen's sides, in viewport px.
const CARD_SIDE := 24

var _api := Api.new()
var _clock := Clock.new()
var _session := Session.new(_api, _clock)
var _map_socket := LiveSocket.new()
var _alliance_socket := LiveSocket.new()
var _world := Node2D.new()
var _map := WorldMap.new()
var _camera := MapCamera.new()
var _hud_root := Control.new()
var _status := StatusCard.new()
var _coords := Label.new()
var _top := HudTop.new()
var _bottom := HudBottom.new()
var _settings := SettingsPage.new()
var _offline_badge := OfflineBadge.new()
var _loading_layer := CanvasLayer.new()
var _loaded := false
var _base := BaseScreen.new()
var _reports_screen := ReportsScreen.new()
var _alliance_screen := AllianceScreen.new()
var _heroes_screen := HeroesScreen.new()
var _tile_panel := TilePanel.new()
var _march_sheet := MarchSheet.new()
var _marches_list := MarchesList.new()
var _toast := ReportToast.new()
var _map_tools := MapTools.new()
var _find_sheet := FindSheet.new()
## When the minimap last took the snapshot (it rebakes only when the liberated regions change).
var _minimap_ms := -100000
var _top_box: Control
var _screen := "base"
## The last of Base and Map: where a page's back button and a second tap on its bottom button return.
var _home := "base"
## A report arrived while the Reports page was not open: the one-dot mark on its button.
var _reports_unseen := false
var _failed := false

func _ready() -> void:
	RenderingServer.set_default_clear_color(GroundFrame.BACKGROUND)
	# Under everything until the map is built, so loading is not an empty screen.
	_loading_layer.layer = -10
	_loading_layer.add_child(PageBackdrop.new())
	add_child(_loading_layer)
	_api.base_url = Api.resolve_base_url()
	add_child(_api)
	_setup_sockets()
	_setup_fps_debug()
	add_child(_world)
	_world.add_child(_map)
	_world.add_child(_camera)
	_camera.moved.connect(_update_coords)
	_camera.tapped.connect(_on_map_tapped)
	_camera.moved.connect(_on_camera_moved)
	_base.setup(_session)
	# Members or help requests changed on the alliance socket: the view is fetched again (see Session.refresh_alliance).
	_session.alliance_changed.connect(func() -> void: _session.refresh_alliance())
	# The alliance feed follows the membership, not the map build: it starts when the player is in an alliance (joined, founded or
	# found at start-up), restarts for another one, and stops for none (left, kicked, disbanded).
	_session.alliance_id_changed.connect(_on_alliance_id_changed)
	_session.help_changed.connect(func() -> void: _session.refresh())
	_session.chat_changed.connect(_update_dots)
	_session.alliance_refreshed.connect(_update_dots)
	_session.help_changed.connect(_update_dots)
	_top.pill.help_pressed.connect(_ask_help.bind("upgrade"))
	add_child(_base)
	_build_hud()
	_apply_language("en")
	_show_screen("base")
	_start()

func _start() -> void:
	var started_ms := Time.get_ticks_msec()
	_refresh_status()
	var session := await _retry_start(_api.ensure_session)
	if not session["ok"]:
		_show_error()
		return
	_session.apply(session["data"])
	_settings.set_guest_tag(HudModel.guest_tag(_api.token))
	_top.chip.set_tag(HudModel.guest_tag(_api.token))
	# The base needs only the state, so it is ready (and the default screen) before the heavy map build.
	_base.build()
	_debug_time("base ready", started_ms)
	_refit()
	_refresh_status()
	_session.load_reports()
	# The alliance (and the help buttons that depend on it) does not wait for the map build.
	_session.refresh_alliance()
	_session.load_wallet()
	var reply := await _retry_start(_api.get_json.bind("/v1/map"))
	if not reply["ok"]:
		_show_error()
		return
	_session.apply({"now": reply["data"]["now"]})
	_session.set_liberations(reply["data"]["liberations"], int(reply["data"]["now"]))
	var map_started_ms := Time.get_ticks_msec()
	# Props only round the camera: the map is too big to dress all at once on a phone.
	_map.windowed = true
	await _map.build(reply["data"])
	_debug_time("map build", map_started_ms)
	if _fps_timer != null:
		_debug_log("[fps] map stages %s" % [_map.build_times])
	if is_instance_valid(_loading_layer):
		_loading_layer.queue_free()
	# Room past the edge, so the frontier shows all round.
	_camera.bounds = Iso.world_bounds(_map.size).grow(MAP_MARGIN)
	_camera.map_size = _map.size
	var own := _map.own_base_tile()
	if own.x >= 0:
		_camera.focus_world(Iso.tile_to_world(own.x + 1.0, own.y + 1.0))
	else:
		_camera.focus_world(Iso.tile_to_world(_map.size * 0.5, _map.size * 0.5))
	_apply_hidden_layers()
	_update_map_view()
	_loaded = true
	_refresh_status()
	_update_coords()
	# The live feeds start once the first build is done, so no snapshot arrives while the map is being built.
	_map_socket.start(Time.get_ticks_msec())

## Runs a start-up request, trying again with the client's backoff (1, 2, 5, 10 s) while the failure is transient, so a phone on
## a flaky network recovers by itself. Only a refusal ends it. "Unreachable" shows while it waits.
func _retry_start(request: Callable) -> Dictionary:
	var attempt := 0
	while true:
		var result: Dictionary = await request.call()
		if result["ok"]:
			_failed = false
			_refresh_status()
			return result
		if not SessionPolicy.is_transient(int(result["status"])):
			return result
		_failed = true
		_refresh_status()
		if _fps_timer != null:
			_debug_log("[start] attempt %d failed, status=%d, retrying in %d ms" % [attempt, int(result["status"]), SessionPolicy.start_backoff_ms(attempt)])
		await get_tree().create_timer(SessionPolicy.start_backoff_ms(attempt) / 1000.0).timeout
		attempt += 1
	return {}

## Web only: `?debug=net` prints the live feeds' connection changes and frame types to the browser console (debug aid).
func _debug_net() -> bool:
	if not OS.has_feature("web"):
		return false
	return JavaScriptBridge.eval("new URLSearchParams(window.location.search).get('debug')") == "net"

## With `?debug=fps` on the web, prints how long a step took since `since_ms` (debug aid).
func _debug_time(what: String, since_ms: int) -> void:
	if _fps_timer != null:
		_debug_log("[fps] %s ms=%d at=%d" % [what, Time.get_ticks_msec() - since_ms, Time.get_ticks_msec()])

## Prints to the console and keeps the line in `window.revoltLog`, which tooling can read (debug aid).
func _debug_log(text: String) -> void:
	print(text)
	JavaScriptBridge.eval("(window.revoltLog = window.revoltLog || []).push(%s)" % JSON.stringify(text))

## Web only: `?debug=fps` prints frame rate, draw calls and object counts to the console every 3 s, and gives the page
## `window.revoltShow("base" | "map" | "reports")`, `window.revoltLang("en" | "ar" | "fr")`, `window.revoltRefresh()`,
## `window.revoltReport(json)` (a battle report as the server sends it, pushed as the map socket would), `window.revoltSheet(id)` (opens a building's sheet on the base), `window.revoltPost(path, json)` (a POST as the player, for the alliance checks) and `window.revoltHide(layer, hidden)`
## to hide a map layer at runtime ("ground", "props", "objects"), to see what each costs (debug aid).
var _js_hide: JavaScriptObject
var _js_show: JavaScriptObject
var _js_lang: JavaScriptObject
var _js_refresh: JavaScriptObject
var _js_report: JavaScriptObject
var _js_sheet: JavaScriptObject
var _js_post: JavaScriptObject
var _js_tile: JavaScriptObject
var _fps_timer: Timer

func _setup_fps_debug() -> void:
	if not OS.has_feature("web"):
		return
	if JavaScriptBridge.eval("new URLSearchParams(window.location.search).get('debug')") != "fps":
		return
	_js_hide = JavaScriptBridge.create_callback(func(args: Array) -> void: _map.set_layer_visible(str(args[0]), not bool(args[1])))
	JavaScriptBridge.get_interface("window").revoltHide = _js_hide
	_js_show = JavaScriptBridge.create_callback(func(args: Array) -> void: _show_screen(str(args[0])))
	JavaScriptBridge.get_interface("window").revoltShow = _js_show
	_js_lang = JavaScriptBridge.create_callback(func(args: Array) -> void: _apply_language(str(args[0])))
	JavaScriptBridge.get_interface("window").revoltLang = _js_lang
	_js_refresh = JavaScriptBridge.create_callback(func(_args: Array) -> void: _session.refresh())
	JavaScriptBridge.get_interface("window").revoltRefresh = _js_refresh
	_js_report = JavaScriptBridge.create_callback(func(args: Array) -> void: _inject_report(str(args[0])))
	JavaScriptBridge.get_interface("window").revoltReport = _js_report
	_js_sheet = JavaScriptBridge.create_callback(func(args: Array) -> void: _base.open_card(str(args[0])))
	JavaScriptBridge.get_interface("window").revoltSheet = _js_sheet
	_js_tile = JavaScriptBridge.create_callback(func(args: Array) -> void: _select_tile(Vector2i(int(args[0]), int(args[1]))))
	JavaScriptBridge.get_interface("window").revoltTile = _js_tile
	_js_post = JavaScriptBridge.create_callback(func(args: Array) -> void: _debug_post(str(args[0]), str(args[1])))
	JavaScriptBridge.get_interface("window").revoltPost = _js_post
	_fps_timer = Timer.new()
	_fps_timer.wait_time = 3.0
	_fps_timer.timeout.connect(func() -> void:
		_debug_log("[fps] screen=%s fps=%d process_ms=%.1f draw_calls=%d objects=%d primitives=%d" % [
			_screen, Engine.get_frames_per_second(), Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
			Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
			Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
			Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)]))
	add_child(_fps_timer)
	_fps_timer.start()

func _setup_sockets() -> void:
	if _debug_net():
		_map_socket.connection_changed.connect(func(open: bool) -> void: print("[net] map socket open=", open))
		_map_socket.message.connect(func(msg: Dictionary) -> void: print("[net] map frame ", msg["type"]))
		_alliance_socket.connection_changed.connect(func(open: bool) -> void: print("[net] alliance socket open=", open))
		_alliance_socket.message.connect(func(msg: Dictionary) -> void: print("[net] alliance frame ", msg["type"]))
	_map_socket.url = LiveSocket.ws_url(_api.base_url, "/v1/map/ws")
	_map_socket.token_source = func() -> String: return _api.token
	_map_socket.parser = MapMessages.parse
	_map_socket.message.connect(_on_map_message)
	# A closed feed (while it should be running) is the first sign of a lost connection: ask the server once. If it answers,
	# the quick reconnect changes nothing; if not, the session goes offline by the usual rule.
	_map_socket.connection_changed.connect(func(open: bool) -> void:
		if not open and _map_socket.is_running():
			_session.refresh())
	add_child(_map_socket)
	_alliance_socket.url = LiveSocket.ws_url(_api.base_url, "/v1/alliance/ws")
	_alliance_socket.token_source = func() -> String: return _api.token
	_alliance_socket.parser = AllianceMessages.parse
	_alliance_socket.message.connect(_on_alliance_message)
	_alliance_socket.connection_changed.connect(func(open: bool) -> void: _alliance_screen.set_connected(open))
	add_child(_alliance_socket)
	# The server no longer knows this token: stop retrying (nothing else is done, see Session).
	_session.auth_lost.connect(func() -> void:
		_map_socket.stop()
		_alliance_socket.stop())

## Debug aid (`?debug=fps`): a POST to the server as the player's own session (`revoltPost(path, json)`), then the alliance and the
## base are fetched again. The token is never printed. Used to make an alliance on the pane's guest for the help check.
func _debug_post(path: String, text: String) -> void:
	var parser := JSON.new()
	var body: Variant = parser.data if parser.parse(text) == OK else {}
	var reply := await _api.post_json(path, body)
	_debug_log("[post] %s status=%d" % [path, int(reply["status"])])
	_session.refresh_alliance()
	_session.refresh()

## Debug aid (`?debug=fps`): one report as the server sends it, taken as if pushed on the map socket.
func _inject_report(text: String) -> void:
	var parser := JSON.new()
	if parser.parse(text) == OK and parser.data is Dictionary:
		_session.add_report(parser.data)

## The alliance feed runs only while the player is in an alliance (the server checks the membership when it connects, so another
## alliance means a new connection).
func _on_alliance_id_changed(id: String) -> void:
	_alliance_socket.stop()
	if id != "":
		_alliance_socket.start(Time.get_ticks_msec())

## A tap on the map (the camera says it was a real tap, not a drag, and no HUD control took it): selects the tile or target under it.
func _on_map_tapped(screen: Vector2) -> void:
	if _screen != "map" or not _loaded or _map.snapshot.is_empty():
		return
	_select_tile(MapPicker.pick(_map.snapshot, _map.size, _camera.world_at(screen)))

## Selects a tile (the outline on the map and the sheet), or clears the selection with (-1, -1).
func _select_tile(tile: Vector2i) -> void:
	if tile.x >= 0:
		_find_sheet.close()
	_map.overlay().set_selected(tile)
	_tile_panel.show_tile(tile)
	_update_coords()

## The leader's Place or Move HQ on the shown tile: the server decides; a refusal's reason shows under the button, and on success the map
## socket turns the tile into the HQ.
func _place_hq(tile: Vector2i) -> void:
	var verdict: Dictionary = await _session.place_hq(tile.x, tile.y)
	if verdict["ok"] or verdict["reason"] == "":
		return
	if _tile_panel.tile() != tile:
		return
	_tile_panel.show_notice("unreachable" if verdict["reason"] == "error" else String(verdict["reason"]))

## Opens the march sheet for a target the tile sheet showed, from the player's own camp.
func _open_march_sheet(npc: Dictionary, mode := "march", rally := {}) -> void:
	var from := _map.own_base_tile()
	if from.x < 0 or _session.state.is_empty():
		return
	_march_sheet.open(npc, from, mode, rally)

## Opens the harvest sheet for a free resource site the tile sheet showed, from the player's own camp.
func _open_harvest_sheet(site: Dictionary) -> void:
	var from := _map.own_base_tile()
	if from.x < 0 or _session.state.is_empty():
		return
	_march_sheet.open(site, from, "harvest")

## Calls a harvest march home (the Recall button on the tile sheet, `from_tile`, or in the marches list), then fetches the base again.
## "not_found" means there was nothing to recall (it came home already): no message. Any other refusal shows its reason on the sheet
## that sent it, and only there (the tile sheet only while it still shows that tile).
func _recall_harvest(march_id: String, from_tile: bool) -> void:
	var tile := _tile_panel.tile()
	var verdict: Dictionary = await _session.harvest_recall(march_id)
	_session.refresh()
	_tile_panel.refresh()
	var reason := ""
	if not (verdict["ok"] or verdict["reason"] in ["", "not_found"]):
		reason = "unreachable" if verdict["reason"] == "error" else String(verdict["reason"])
	if from_tile:
		if _tile_panel.tile() == tile:
			_tile_panel.show_notice(reason)
	else:
		_marches_list.show_notice(reason)

## One chat line from the player, as a frame on the alliance socket; false when the socket is not open.
func _send_chat(text: String) -> bool:
	return _alliance_socket.send_text(AllianceMessages.chat_frame(text))

func _on_map_message(msg: Dictionary) -> void:
	_session.mark_reachable()
	match msg["type"]:
		"map":
			var snap: Dictionary = msg["snapshot"]
			_session.apply({"now": snap["now"]})
			_session.set_liberations(snap["liberations"], int(snap["now"]))
			await _map.apply_snapshot(snap)
		"report":
			_session.add_report(msg["report"])
		"base_changed":
			_session.refresh()

## Asks the alliance for help with the running upgrade; a refusal's reason shows on the pill for a moment.
func _ask_help(kind: String) -> void:
	var verdict := await _session.request_help(kind)
	if not verdict["ok"] and verdict["reason"] != "":
		_top.pill.show_note(String(verdict["reason"]))

func _on_alliance_message(msg: Dictionary) -> void:
	_session.mark_reachable()
	if msg["type"] == "error":
		_alliance_screen.show_note(String(msg["reason"]))
	elif _session.apply_alliance_message(msg):
		_alliance_socket.stop()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_RESUMED and _loaded:
		# Back from the background: the state may have moved, and a socket the OS dropped is reconnected.
		var now := Time.get_ticks_msec()
		_session.refresh()
		_session.load_reports()
		_session.refresh_alliance()
		_session.load_wallet()
		_map_socket.ensure_open(now)
		_alliance_socket.ensure_open(now)

## Web only: `?hide=props` hides map layers, to see what each one contributes (debug aid).
func _apply_hidden_layers() -> void:
	if not OS.has_feature("web"):
		return
	var q: Variant = JavaScriptBridge.eval("new URLSearchParams(window.location.search).get('hide')")
	if q is String and q != "":
		for layer in (q as String).split(","):
			_map.set_layer_visible(layer, false)

func _show_error() -> void:
	_failed = true
	_refresh_status()

## The card in the middle: the failure, or "Loading" while the base or the map waits for its first build; nothing otherwise.
func _refresh_status() -> void:
	if _failed:
		# The failure's codes under the message, so a report from a phone says what went wrong.
		_status.show_status("offline", Loc.t("reason.unreachable"), Loc.t("reason.unreachableDetail", _api.last_failure))
	elif _screen == "base" and not _base.is_built():
		_status.show_status("hourglass", Loc.t("alliance.loading"))
	elif _screen == "map" and not _loaded:
		_status.show_status("hourglass", Loc.t("map.loading"))
	else:
		_status.visible = false

## Shows "base" or "map", or a page. The hidden screen is neither drawn nor given input.
func _show_screen(screen: String) -> void:
	_screen = screen
	if screen == "base" or screen == "map":
		_home = screen
	var on_map := screen == "map"
	_world.visible = on_map
	_world.process_mode = Node.PROCESS_MODE_INHERIT if on_map else Node.PROCESS_MODE_DISABLED
	_base.set_active(screen == "base")
	_reports_screen.visible = screen == "reports"
	_alliance_screen.visible = screen == "alliance"
	_heroes_screen.visible = screen == "heroes"
	_settings.visible = screen == "settings"
	# The tab bar is on every screen; the resource bar is not on Settings.
	_top.visible = screen != "settings"
	_top.show_context(screen)
	_bottom.set_screen(screen)
	if screen == "reports":
		_reports_unseen = false
		_update_dots()
	_march_sheet.close()
	_find_sheet.close()
	if screen != "map":
		_select_tile(Vector2i(-1, -1))
	if screen == "reports":
		# The list shows at once from what is held; the server's list (which may hold a report the socket missed) follows.
		_session.load_reports()
	elif screen == "alliance":
		_session.refresh_alliance()
	_refresh_status()
	_update_coords()

## A report pushed on the map socket: the notice, which opens the report when tapped.
func _on_new_report(report: Dictionary) -> void:
	_toast.show_report(report)
	if _screen != "reports":
		_reports_unseen = true
		_update_dots()

func _open_report(id: String) -> void:
	_show_screen("reports")
	_reports_screen.open_report(id)

## Fits the base, and the Reports screen, between the HUD and the nav bar; called when either changes size.
func _refit() -> void:
	if _top_box == null:
		return
	var top := _top_box.get_global_rect().end.y
	_reports_screen.offset_top = top
	_reports_screen.offset_bottom = -NAV_HEIGHT
	_alliance_screen.offset_top = top
	_alliance_screen.offset_bottom = -NAV_HEIGHT
	_heroes_screen.offset_top = top
	_heroes_screen.offset_bottom = -NAV_HEIGHT
	_march_sheet.offset_top = top
	_march_sheet.offset_bottom = -NAV_HEIGHT
	_toast.offset_top = top + TOAST_GAP
	_place_marches_list()
	_map_tools.place(float(NAV_HEIGHT) + HudTheme.px(NavTab.RISE), TranslationServer.get_locale().begins_with("ar"))
	_update_map_tools()
	_base.card_layer.offset_top = top
	if not _base.is_built():
		return
	_base.refit(get_viewport().get_visible_rect().size, top, float(NAV_HEIGHT))

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	_hud_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_hud_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hud_root.layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	# Every screen is under this root, so the stock buttons and fields take the kit's look everywhere.
	_hud_root.theme = HudTheme.build()
	layer.add_child(_hud_root)

	# The top (resource bar, player chip, context strip) and the bottom (round buttons, Base/Map switch) use the bronze HUD theme;
	# so does the building sheet. The other sheets keep their own styling until they are restyled.
	var theme := HudTheme.build()
	_base.panel.theme = theme
	_base.ring.theme = theme
	_top_box = _top
	_top.theme = theme
	_top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_top.offset_left = 0.0
	_top.offset_right = 0.0
	_top.offset_top = 0.0
	_top.chip_pressed.connect(_show_screen.bind("settings"))
	_hud_root.add_child(_top)

	_status.set_anchors_preset(Control.PRESET_CENTER)
	_status.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_status.grow_vertical = Control.GROW_DIRECTION_BOTH
	_hud_root.add_child(_status)

	_coords.add_theme_font_size_override("font_size", HudTheme.font(UiKit.SMALL))
	_coords.add_theme_stylebox_override("normal", HudTheme.tag(16.0, 4.0))
	# A tap on the plate opens the Find sheet.
	_coords.mouse_filter = Control.MOUSE_FILTER_STOP
	_coords.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			_open_find())
	# In a row, so the plate is as wide as its text, at the reading start.
	var coords_row := HBoxContainer.new()
	coords_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	coords_row.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	coords_row.grow_vertical = Control.GROW_DIRECTION_BEGIN
	coords_row.offset_left = 24
	coords_row.offset_right = -24
	coords_row.offset_bottom = -16 - NAV_HEIGHT
	coords_row.add_child(_coords)
	_hud_root.add_child(coords_row)

	# The round buttons over a tapped building, and the building card centred between the counters and the nav bar on a dim
	# backdrop (its band is set in _refit).
	_base.ring.set_anchors_preset(Control.PRESET_FULL_RECT)
	_hud_root.add_child(_base.ring)
	_base.card_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	_base.card_layer.offset_bottom = -NAV_HEIGHT
	_hud_root.add_child(_base.card_layer)
	_base.panel.anchor_left = 0.0
	_base.panel.anchor_right = 1.0
	_base.panel.anchor_top = 0.5
	_base.panel.anchor_bottom = 0.5
	_base.panel.offset_left = CARD_SIDE
	_base.panel.offset_right = -CARD_SIDE
	_base.card_layer.add_child(_base.panel)

	# Above the screens, below the offline badge; hidden until its screen shows.
	_reports_screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	_reports_screen.visible = false
	_hud_root.add_child(_reports_screen)
	_reports_screen.home_requested.connect(func() -> void: _show_screen(_home))
	_reports_screen.map_requested.connect(_show_screen.bind("map"))
	_session.reports_changed.connect(func() -> void: _reports_screen.set_reports(_session.reports))
	_reports_screen.set_reports(_session.reports)
	_alliance_screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	_alliance_screen.visible = false
	_alliance_screen.setup(_session)
	_alliance_screen.home_requested.connect(func() -> void: _show_screen(_home))
	_alliance_screen.send_chat = _send_chat
	_hud_root.add_child(_alliance_screen)
	# A tab of its own, and opened from the hero hall's card too; its back button goes home.
	_heroes_screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	_heroes_screen.visible = false
	_heroes_screen.setup(_session)
	_heroes_screen.closed.connect(func() -> void: _show_screen(_home))
	_base.heroes_requested.connect(func() -> void: _show_screen("heroes"))
	_hud_root.add_child(_heroes_screen)
	# The tapped tile's sheet sits above the nav bar, under the offline badge; the coordinates label hides while it shows.
	_tile_panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_tile_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_tile_panel.offset_left = 16
	_tile_panel.offset_right = -16
	# Clear of the raised middle tab.
	_tile_panel.offset_bottom = -NAV_HEIGHT - HudTheme.px(NavTab.RISE) - 4.0
	_tile_panel.closed.connect(func() -> void: _select_tile(Vector2i(-1, -1)))
	# The minimap, Find and My base sit in the bottom corner at the reading end, under the sheets.
	_map_tools.jump.connect(func(t: Vector2i) -> void: _look_at_tile(t, false))
	_map_tools.find_pressed.connect(_open_find)
	_map_tools.home_pressed.connect(_go_home)
	_hud_root.add_child(_map_tools)
	_hud_root.add_child(_tile_panel)
	_find_sheet.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_find_sheet.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_find_sheet.offset_left = 16
	_find_sheet.offset_right = -16
	_find_sheet.offset_bottom = _tile_panel.offset_bottom
	_find_sheet.closed.connect(_close_find)
	_find_sheet.go.connect(func(t: Vector2i) -> void: _look_at_tile(t, true))
	_hud_root.add_child(_find_sheet)
	# Send march on a target opens the sheet over the map; a march that left clears the selection with it.
	_march_sheet.set_anchors_preset(Control.PRESET_FULL_RECT)
	_march_sheet.setup(_session)
	_march_sheet.sent.connect(func() -> void: _select_tile(Vector2i(-1, -1)))
	_tile_panel.march_requested.connect(_open_march_sheet)
	_tile_panel.hq_requested.connect(_place_hq)
	_tile_panel.rally_start_requested.connect(func(npc: Dictionary) -> void: _open_march_sheet(npc, "rally_start"))
	_tile_panel.rally_join_requested.connect(func(npc: Dictionary, rally: Dictionary) -> void: _open_march_sheet(npc, "rally_join", rally))
	_tile_panel.harvest_requested.connect(_open_harvest_sheet)
	_tile_panel.recall_requested.connect(func(march_id: String) -> void: _recall_harvest(march_id, true))
	_marches_list.recall_requested.connect(func(march_id: String) -> void: _recall_harvest(march_id, false))
	_alliance_screen.rally_join_requested.connect(func(rally: Dictionary) -> void: _open_march_sheet(RallyModel.npc_of(rally), "rally_join", rally))
	_hud_root.add_child(_march_sheet)
	# The player's marches float under the top box on the map only, so the base is never refitted when one starts or ends.
	_marches_list.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_marches_list.offset_left = 24
	_marches_list.offset_right = -24
	_hud_root.add_child(_marches_list)
	_build_offline_badge()

	# Just under the top box, as the Phaser client does (`refit` moves it with the box).
	_toast.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_toast.offset_left = 24
	_toast.offset_right = -24
	_toast.grow_vertical = Control.GROW_DIRECTION_END
	_toast.opened.connect(_open_report)
	# The marches make room under it while it shows.
	_toast.visibility_changed.connect(_place_marches_list)
	_session.report_received.connect(_on_new_report)
	_hud_root.add_child(_toast)

	_bottom.theme = theme
	_bottom.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_bottom.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_bottom.offset_left = HudTheme.px(HudBottom.INSET_SIDE)
	_bottom.offset_right = -HudTheme.px(HudBottom.INSET_SIDE)
	_bottom.offset_top = -NAV_HEIGHT
	_bottom.offset_bottom = -HudTheme.px(HudBottom.INSET_BOTTOM)
	_bottom.page_requested.connect(_on_page_requested)
	_bottom.switch_requested.connect(_show_screen)
	_hud_root.add_child(_bottom)

	# Settings: a full page above everything but the offline badge's row; Back returns to Base or Map.
	_settings.theme = theme
	_settings.back_pressed.connect(func() -> void: _show_screen(_home))
	_settings.language_selected.connect(_apply_language)
	_settings.offset_bottom = -NAV_HEIGHT
	_hud_root.add_child(_settings)
	# The tab bar's raised tabs stand over every page.
	_hud_root.move_child(_bottom, -1)

	_top.resized.connect(_refit)
	get_viewport().size_changed.connect(_refit)

## A bottom button for a page opens it; tapping the open page's button again goes back to Base or Map.
func _on_page_requested(page: String) -> void:
	_show_screen(_home if _screen == page else page)

## The one-dot marks: unread chat or an open help request on Alliance, a report not yet opened on Reports.
func _update_dots() -> void:
	var now := _clock.now_ms(Time.get_ticks_msec())
	_bottom.buttons["alliance"].set_dot(HudModel.alliance_dot(_session.unread(), HelpModel.open_requests(_session.help, now).size()))
	_bottom.buttons["reports"].set_dot(_reports_unseen)

## "Offline — reconnecting…", centred over the tab bar, above the map's coordinates. It is outside the top box, so it never moves the base.
func _build_offline_badge() -> void:
	_offline_badge.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_offline_badge.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_offline_badge.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_offline_badge.offset_bottom = -NAV_HEIGHT - HudTheme.px(36.0)
	_hud_root.add_child(_offline_badge)
	_session.connection_changed.connect(_offline_badge.set_online)

## The player's marches float under the top bar, or under the report's notice while it shows.
func _place_marches_list() -> void:
	if _top_box == null:
		return
	var gap := TOAST_GAP + (_toast.get_combined_minimum_size().y + TOAST_GAP if _toast.visible else 0.0)
	_marches_list.offset_top = _top_box.get_global_rect().end.y + gap

func _apply_language(lang: String) -> void:
	TranslationServer.set_locale(lang)
	_offline_badge.refresh()
	_bottom.refresh_language()
	_bottom.set_screen(_screen)
	_settings.set_language(lang)
	_top.marches.refresh()
	_reports_screen.refresh()
	_alliance_screen.refresh()
	_heroes_screen.refresh()
	_tile_panel.refresh()
	_find_sheet.refresh()
	_map_tools.refresh_language()
	_march_sheet.refresh_language()
	_marches_list.refresh()
	_update_dots()
	_toast.refresh()
	_refresh_status()
	_update_coords()
	# The language changes the HUD's height (button and counter texts), so the base is fitted again.
	_refit.call_deferred()

func _on_camera_moved() -> void:
	_map.set_view_zoom(_camera.view_zoom)
	_update_map_view()

## Tells the map what the camera shows, so it dresses the chunks round it.
func _update_map_view() -> void:
	var top_left := _camera.world_at(Vector2.ZERO)
	var bottom_right := _camera.world_at(get_viewport().get_visible_rect().size)
	_map.set_view(Rect2(top_left, bottom_right - top_left), _camera.view_zoom)

## Opens the Find sheet over the map, searching outward from the tile the camera looks at.
func _open_find() -> void:
	if _screen != "map" or not _loaded:
		return
	_select_tile(Vector2i(-1, -1))
	var t := Iso.world_to_tile(_camera.position)
	_find_sheet.open(_map.snapshot, Vector2i(int(floor(t.x)), int(floor(t.y))))
	_update_coords()

## The phone's keyboard covers the bottom of the screen and Godot does not move the view for it: the Find sheet rises above it.
func _lift_find_sheet() -> void:
	var rest := _tile_panel.offset_bottom
	# The web's display server has no virtual keyboard (and warns on every call).
	var keyboard := DisplayServer.virtual_keyboard_get_height() if DisplayServer.has_feature(DisplayServer.FEATURE_VIRTUAL_KEYBOARD) else 0
	var window_h := DisplayServer.window_get_size().y
	var lift := 0.0
	if keyboard > 0 and window_h > 0:
		lift = maxf(0.0, keyboard * get_viewport().get_visible_rect().size.y / window_h + rest)
	_find_sheet.offset_bottom = rest - lift

func _close_find() -> void:
	_find_sheet.close()
	_update_coords()

## Moves the camera to a tile; `select` also selects it (its sheet opens) and closes the Find sheet.
func _look_at_tile(tile: Vector2i, select: bool) -> void:
	if not _loaded:
		return
	_camera.focus_world(Iso.tile_to_world(tile.x + 0.5, tile.y + 0.5))
	if select:
		_find_sheet.close()
		_select_tile(tile)
	_update_map_tools()
	_update_coords()

func _go_home() -> void:
	var own := _map.own_base_tile()
	if own.x >= 0:
		_close_find()
		_look_at_tile(own, false)

## The minimap's view outline and the base arrow follow the camera; the corner hides under a sheet.
func _update_map_tools() -> void:
	var on := _loaded and _screen == "map" and not _tile_panel.visible and not _find_sheet.visible and not _march_sheet.is_open()
	_map_tools.visible = on
	if not on or _top_box == null:
		return
	var vp := get_viewport().get_visible_rect().size
	var top := _top_box.get_global_rect().end.y
	var band := Rect2(0.0, top, vp.x, vp.y - NAV_HEIGHT - top)
	var corners: Array = []
	for p: Vector2 in [band.position, Vector2(band.end.x, band.position.y), band.end, Vector2(band.position.x, band.end.y)]:
		corners.append(Iso.world_to_tile(_camera.world_at(p)))
	_map_tools.minimap.set_view(corners)
	var own := _map.own_base_tile()
	if own.x < 0:
		_map_tools.clear_arrow()
		return
	var world := Iso.tile_to_world(own.x + 1.0, own.y + 1.0)
	var screen := _map.get_global_transform_with_canvas() * world
	var here := Iso.world_to_tile(_camera.position)
	# The march's own measure (rules tileDistance), as the Phaser arrow showed it.
	var tiles := roundi(Vector2(own).distance_to(here))
	_map_tools.set_arrow(screen, band, tiles)

func _update_coords() -> void:
	var t := Iso.world_to_tile(_camera.position)
	_coords.text = Loc.t("map.coords", {"x": clampi(int(floor(t.x)), 0, maxi(_map.size - 1, 0)), "y": clampi(int(floor(t.y)), 0, maxi(_map.size - 1, 0))})
	_coords.visible = _loaded and _screen == "map" and not _tile_panel.visible and not _find_sheet.visible
	_update_map_tools()

func _process(_delta: float) -> void:
	if _session.resources.is_empty() or not _clock.is_synced():
		return
	_session.tick()
	var now := _clock.now_ms(Time.get_ticks_msec())
	var amounts := ResourceDisplay.amounts(_session.resources, _session.levels, _session.last_updated, now, _session.liberations)
	var lang := Fmt.lang()
	_top.set_resources(HudModel.chips(amounts, int(_session.levels["hq"])), HudModel.rates(_session.levels, _session.liberations, now))
	_top.chip.set_values(int(_session.levels["hq"]), HudModel.power(_session.state.get("troops", {})))
	_settings.set_player(int(_session.levels["hq"]), HudModel.power(_session.state.get("troops", {})))
	_top.marches.set_count(_session.state.get("marches", []).size())
	# A help request can run out with nothing arriving, so the dots are looked at each frame (a tab ignores what it already shows).
	_update_dots()
	if _alliance_screen.is_visible_in_tree():
		_alliance_screen.tick(now, _map.snapshot.get("rallies", []))
	if _heroes_screen.is_visible_in_tree():
		_heroes_screen.tick(amounts)
	if _tile_panel.visible and not _map.snapshot.is_empty():
		var tile := _tile_panel.tile()
		_tile_panel.update_view(_map.snapshot, _map.terrain_at_tile(tile.x, tile.y), String(_session.alliance["name"]) if _session.alliance is Dictionary else "", String(_session.alliance["myRank"]) if _session.alliance is Dictionary else "", now, _session.state.get("marches", []))
	if _find_sheet.visible:
		_lift_find_sheet()
	if _screen == "map" and _loaded:
		_map.markers().set_own(_session.state.get("marches", []))
		_map.markers().tick(now, _camera.view_zoom)
		# The minimap takes the snapshot once a second: its dots follow the map, its regions rebake only on a liberation.
		if Time.get_ticks_msec() - _minimap_ms > 1000:
			_minimap_ms = Time.get_ticks_msec()
			_map_tools.minimap.set_snapshot(_map.snapshot, now, _map.region_grid())
			_find_sheet.set_snapshot(_map.snapshot)
		_marches_list.update_view(_session.state.get("marches", []), now, _march_sheet.is_open())
	else:
		_marches_list.visible = false
	var can_help := HelpModel.can_ask(_session.alliance, _session.help, "upgrade", now)
	_top.pill.update_model(HudModel.pill(_session.queue(), now, _screen, can_help), _session.background)
	if _screen == "base":
		_base.update(now, amounts)
