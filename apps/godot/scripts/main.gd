extends Node
## The shell: guest session, the two screens (the base, and the world map with its camera), a small HUD and a bottom nav bar.
## The map (a Node2D tree) is never mirrored in Arabic; only the HUD controls follow the locale direction.

const LANGS: Array[String] = ["en", "ar", "fr"]
const FONT_SIZE := 34
## Height of the bottom nav bar, in viewport px; the base screen and the building sheet keep clear of it.
const NAV_HEIGHT := 100
const SCREENS: Array[String] = ["base", "map", "reports", "alliance"]
## Gap between the top box and the report toast, in viewport px.
const TOAST_GAP := 8

var _api := Api.new()
var _clock := Clock.new()
var _session := Session.new(_api, _clock)
var _map_socket := LiveSocket.new()
var _alliance_socket := LiveSocket.new()
var _world := Node2D.new()
var _map := WorldMap.new()
var _camera := MapCamera.new()
var _hud_root := Control.new()
var _status := Label.new()
var _coords := Label.new()
var _chips := {}
var _pill := QueuePill.new()
var _offline_badge := PanelContainer.new()
var _language_buttons := {}
var _loaded := false
var _base := BaseScreen.new()
var _reports_screen := ReportsScreen.new()
var _alliance_screen := AllianceScreen.new()
var _heroes_screen := HeroesScreen.new()
var _badge := UnreadBadge.new()
var _toast := ReportToast.new()
var _nav := HBoxContainer.new()
var _nav_buttons := {}
var _top_box: VBoxContainer
var _screen := "base"
var _failed := false

func _ready() -> void:
	RenderingServer.set_default_clear_color(GroundFrame.BACKGROUND)
	_api.base_url = Api.resolve_base_url()
	add_child(_api)
	_setup_sockets()
	_setup_fps_debug()
	add_child(_world)
	_world.add_child(_map)
	_world.add_child(_camera)
	_camera.moved.connect(_update_coords)
	_camera.moved.connect(_on_camera_moved)
	_base.setup(_session)
	_session.state_changed.connect(_refresh_names)
	# Members or help requests changed on the alliance socket: the view is fetched again (see Session.refresh_alliance).
	_session.alliance_changed.connect(func() -> void: _session.refresh_alliance())
	# The alliance feed follows the membership, not the map build: it starts when the player is in an alliance (joined, founded or
	# found at start-up), restarts for another one, and stops for none (left, kicked, disbanded).
	_session.alliance_id_changed.connect(_on_alliance_id_changed)
	_session.help_changed.connect(func() -> void: _session.refresh())
	_session.chat_changed.connect(_update_badge)
	_session.alliance_refreshed.connect(_update_badge)
	_pill.help_pressed.connect(_ask_help.bind("upgrade"))
	add_child(_base)
	_build_hud()
	_apply_language("en")
	_show_screen("base")
	_start()

func _start() -> void:
	var started_ms := Time.get_ticks_msec()
	_status.text = Loc.t("map.loading")
	var session := await _retry_start(_api.ensure_session)
	if not session["ok"]:
		_show_error()
		return
	_session.apply(session["data"])
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
	await _map.build(reply["data"])
	_debug_time("map build", map_started_ms)
	_camera.bounds = Iso.world_bounds(_map.size)
	var own := _map.own_base_tile()
	if own.x >= 0:
		_camera.focus_world(Iso.tile_to_world(own.x + 1.0, own.y + 1.0))
	else:
		_camera.focus_world(Iso.tile_to_world(_map.size * 0.5, _map.size * 0.5))
	_apply_hidden_layers()
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
## to hide a map layer at runtime ("ground", "decals", "features", "wash", "detail", "seams", "props", "objects"), to see what each costs (debug aid).
var _js_hide: JavaScriptObject
var _js_show: JavaScriptObject
var _js_lang: JavaScriptObject
var _js_refresh: JavaScriptObject
var _js_report: JavaScriptObject
var _js_sheet: JavaScriptObject
var _js_post: JavaScriptObject
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
	_js_sheet = JavaScriptBridge.create_callback(func(args: Array) -> void: _base.select(str(args[0])))
	JavaScriptBridge.get_interface("window").revoltSheet = _js_sheet
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
		_pill.show_note(String(verdict["reason"]))

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

## Web only: `?hide=decals,props` hides map layers, to see what each one contributes (debug aid).
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

## The resource names above the counters follow the language and the account's background (Vietnam renames food).
func _refresh_names() -> void:
	for id: String in _chips:
		_chips[id].set_name_text(Loc.t("resource." + id))
	_offline_badge_label().text = Loc.t("sync.offline")

## The centre text: the failure, or "Loading the map…" while the map screen waits for its build; nothing otherwise.
func _refresh_status() -> void:
	if _failed:
		_status.text = Loc.t("reason.unreachable")
		_status.visible = true
	elif _screen == "map" and not _loaded:
		_status.text = Loc.t("map.loading")
		_status.visible = true
	else:
		_status.visible = false

## Shows "base" or "map". The hidden screen is neither drawn nor given input.
func _show_screen(screen: String) -> void:
	_screen = screen
	var on_map := screen == "map"
	_world.visible = on_map
	_world.process_mode = Node.PROCESS_MODE_INHERIT if on_map else Node.PROCESS_MODE_DISABLED
	_base.set_active(screen == "base")
	_reports_screen.visible = screen == "reports"
	_alliance_screen.visible = screen == "alliance"
	_heroes_screen.visible = screen == "heroes"
	for id: String in _nav_buttons:
		_nav_buttons[id].set_pressed_no_signal(id == screen)
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
	_toast.offset_top = top + TOAST_GAP
	if not _base.is_built():
		return
	_base.refit(get_viewport().get_visible_rect().size, top, float(NAV_HEIGHT))

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	_hud_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_hud_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hud_root.layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	layer.add_child(_hud_root)

	var top := VBoxContainer.new()
	_top_box = top
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 24
	top.offset_right = -24
	top.offset_top = 24
	top.add_theme_constant_override("separation", 10)
	_hud_root.add_child(top)

	var counters := GridContainer.new()
	counters.columns = 2
	counters.mouse_filter = Control.MOUSE_FILTER_IGNORE
	counters.add_theme_constant_override("h_separation", 24)
	top.add_child(counters)
	for id: String in Balance.data()["resourceIds"]:
		var chip := ResourceChip.new()
		chip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		counters.add_child(chip)
		_chips[id] = chip
	# The builders' pill stays in the top box: shown on the base idle or busy, on the map only while busy (as the client's HUD).
	top.add_child(_pill)

	var languages := HBoxContainer.new()
	languages.mouse_filter = Control.MOUSE_FILTER_IGNORE
	languages.add_theme_constant_override("separation", 10)
	top.add_child(languages)
	for lang in LANGS:
		var button := Button.new()
		button.add_theme_font_size_override("font_size", FONT_SIZE)
		button.pressed.connect(_apply_language.bind(lang))
		languages.add_child(button)
		_language_buttons[lang] = button

	_status.add_theme_font_size_override("font_size", FONT_SIZE + 6)
	_status.set_anchors_preset(Control.PRESET_CENTER)
	_status.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_status.grow_vertical = Control.GROW_DIRECTION_BOTH
	_status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hud_root.add_child(_status)

	_coords.add_theme_font_size_override("font_size", FONT_SIZE)
	_coords.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_coords.offset_left = 24
	_coords.offset_right = -24
	_coords.offset_bottom = -24 - NAV_HEIGHT
	_coords.offset_top = -24 - NAV_HEIGHT - FONT_SIZE * 1.6
	_coords.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hud_root.add_child(_coords)

	# The building sheet sits right above the nav bar, below the counters; it grows upward from there.
	_base.panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_base.panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_base.panel.offset_bottom = -NAV_HEIGHT
	_hud_root.add_child(_base.panel)

	# Above the screens, below the offline badge; hidden until its screen shows.
	_reports_screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	_reports_screen.visible = false
	_hud_root.add_child(_reports_screen)
	_session.reports_changed.connect(func() -> void: _reports_screen.set_reports(_session.reports))
	_reports_screen.set_reports(_session.reports)
	_alliance_screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	_alliance_screen.visible = false
	_alliance_screen.setup(_session)
	_alliance_screen.send_chat = _send_chat
	_hud_root.add_child(_alliance_screen)
	# Opened from the hero hall's sheet (not a nav item); Close returns to the base.
	_heroes_screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	_heroes_screen.visible = false
	_heroes_screen.setup(_session)
	_heroes_screen.closed.connect(func() -> void: _show_screen("base"))
	_base.heroes_requested.connect(func() -> void: _show_screen("heroes"))
	_hud_root.add_child(_heroes_screen)
	_build_offline_badge()

	# Just under the top box, as the Phaser client does (`refit` moves it with the box).
	_toast.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_toast.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_toast.grow_vertical = Control.GROW_DIRECTION_END
	_toast.layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	_toast.opened.connect(_open_report)
	_session.report_received.connect(_on_new_report)
	_hud_root.add_child(_toast)

	_nav.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_nav.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_nav.offset_top = -NAV_HEIGHT
	_nav.custom_minimum_size.y = NAV_HEIGHT
	_nav.add_theme_constant_override("separation", 6)
	var group := ButtonGroup.new()
	for id in SCREENS:
		var button := Button.new()
		button.toggle_mode = true
		button.button_group = group
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", FONT_SIZE + 2)
		button.pressed.connect(_show_screen.bind(id))
		_nav.add_child(button)
		_nav_buttons[id] = button
	_nav_buttons["alliance"].add_child(_badge)
	_hud_root.add_child(_nav)

	top.resized.connect(_refit)
	get_viewport().size_changed.connect(_refit)

func _update_badge() -> void:
	_badge.set_count(_session.unread(), Fmt.lang())

## "Offline — reconnecting…", centred just above the nav bar. It is outside the top box, so it never moves the base.
func _build_offline_badge() -> void:
	_offline_badge.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_offline_badge.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_offline_badge.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_offline_badge.offset_bottom = -NAV_HEIGHT - 12
	_offline_badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_offline_badge.layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	var box := StyleBoxFlat.new()
	box.bg_color = Color8(0x8a, 0x2f, 0x24, 230)
	box.set_corner_radius_all(18)
	box.content_margin_left = 20
	box.content_margin_right = 20
	box.content_margin_top = 8
	box.content_margin_bottom = 8
	_offline_badge.add_theme_stylebox_override("panel", box)
	var label := Label.new()
	label.add_theme_font_size_override("font_size", FONT_SIZE - 2)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_offline_badge.add_child(label)
	_offline_badge.visible = false
	_hud_root.add_child(_offline_badge)
	_session.connection_changed.connect(func(online: bool) -> void: _offline_badge.visible = not online)

func _offline_badge_label() -> Label:
	return _offline_badge.get_child(0) as Label

func _apply_language(lang: String) -> void:
	TranslationServer.set_locale(lang)
	for l: String in _language_buttons:
		_language_buttons[l].text = Loc.t("language." + l)
	_refresh_names()
	for id: String in _nav_buttons:
		_nav_buttons[id].text = Loc.t("nav." + id)
	_reports_screen.refresh()
	_alliance_screen.refresh()
	_heroes_screen.refresh()
	_badge.place(Fmt.lang())
	_update_badge()
	_toast.refresh()
	_refresh_status()
	_update_coords()
	# The language changes the HUD's height (button and counter texts), so the base is fitted again.
	_refit.call_deferred()

func _on_camera_moved() -> void:
	_map.set_view_zoom(_camera.view_zoom)

func _update_coords() -> void:
	var t := Iso.world_to_tile(_camera.position)
	_coords.text = Loc.t("map.coords", {"x": clampi(int(floor(t.x)), 0, maxi(_map.size - 1, 0)), "y": clampi(int(floor(t.y)), 0, maxi(_map.size - 1, 0))})
	_coords.visible = _loaded and _screen == "map"

func _process(_delta: float) -> void:
	if _session.resources.is_empty() or not _clock.is_synced():
		return
	_session.tick()
	var now := _clock.now_ms(Time.get_ticks_msec())
	var amounts := ResourceDisplay.amounts(_session.resources, _session.levels, _session.last_updated, now, _session.liberations)
	var lang := Fmt.lang()
	for chip: Dictionary in HudModel.chips(amounts, int(_session.levels["hq"])):
		_chips[chip["id"]].set_value_text(Fmt.amount(lang, chip["amount"]))
		_chips[chip["id"]].set_fill(chip["fraction"], chip["state"])
	if _alliance_screen.is_visible_in_tree():
		_alliance_screen.tick(now)
	var can_help := HelpModel.can_ask(_session.alliance, _session.help, "upgrade", now)
	_pill.update_model(HudModel.pill(_session.queue(), now, _screen, can_help), _session.background)
	if _screen == "base":
		_base.update(now, amounts)
