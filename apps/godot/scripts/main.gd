extends Node
## The shell: guest session, the two screens (the base, and the world map with its camera), a small HUD and a bottom nav bar.
## The map (a Node2D tree) is never mirrored in Arabic; only the HUD controls follow the locale direction.

const LANGS: Array[String] = ["en", "ar", "fr"]
const FONT_SIZE := 34
## Height of the bottom nav bar, in viewport px; the base screen and the building sheet keep clear of it.
const NAV_HEIGHT := 100
const SCREENS: Array[String] = ["base", "map"]

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
var _counter_names := {}
var _counter_values := {}
var _language_buttons := {}
var _loaded := false
var _base := BaseScreen.new()
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
	add_child(_base)
	_build_hud()
	_apply_language("en")
	_show_screen("base")
	_start()

func _start() -> void:
	var started_ms := Time.get_ticks_msec()
	_status.text = Loc.t("map.loading")
	var session := await _api.ensure_session()
	if not session["ok"]:
		_show_error()
		return
	_session.apply(session["data"])
	# The base needs only the state, so it is ready (and the default screen) before the heavy map build.
	_base.build()
	_debug_time("base ready", started_ms)
	_refit()
	_refresh_status()
	var reply := await _api.get_json("/v1/map")
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
	_start_alliance_feed()

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
## `window.revoltShow("base" | "map")` and `window.revoltHide(layer, hidden)` to hide a map layer at runtime ("ground", "decals", "features", "wash", "detail", "seams",
## "props", "objects"), to see what each costs (debug aid).
var _js_hide: JavaScriptObject
var _js_show: JavaScriptObject
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
	add_child(_map_socket)
	_alliance_socket.url = LiveSocket.ws_url(_api.base_url, "/v1/alliance/ws")
	_alliance_socket.token_source = func() -> String: return _api.token
	_alliance_socket.parser = AllianceMessages.parse
	_alliance_socket.message.connect(_on_alliance_message)
	add_child(_alliance_socket)
	# The server no longer knows this token: stop retrying (nothing else is done, see Session).
	_session.auth_lost.connect(func() -> void:
		_map_socket.stop()
		_alliance_socket.stop())

## The alliance feed runs only while the player is in an alliance.
func _start_alliance_feed() -> void:
	var mine := await _api.get_json("/v1/alliance")
	if mine["ok"] and mine["data"] is Dictionary and mine["data"].get("alliance") != null:
		_session.apply({"now": mine["data"].get("now")})
		_alliance_socket.start(Time.get_ticks_msec())

func _on_map_message(msg: Dictionary) -> void:
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

func _on_alliance_message(msg: Dictionary) -> void:
	if _session.apply_alliance_message(msg):
		_alliance_socket.stop()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_RESUMED and _loaded:
		# Back from the background: the state may have moved, and a socket the OS dropped is reconnected.
		var now := Time.get_ticks_msec()
		_session.refresh()
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
	for id: String in _counter_names:
		_counter_names[id].text = Loc.t("resource." + id)

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
	_base.set_active(not on_map)
	for id: String in _nav_buttons:
		_nav_buttons[id].set_pressed_no_signal(id == screen)
	_refresh_status()
	_update_coords()

## Fits the base between the HUD and the nav bar; called when either changes size.
func _refit() -> void:
	if _top_box == null or not _base.is_built():
		return
	var top := _top_box.get_global_rect().end.y
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
		var row := HBoxContainer.new()
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		counters.add_child(row)
		var name_label := _label(FONT_SIZE)
		name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(name_label)
		var value_label := _label(FONT_SIZE)
		row.add_child(value_label)
		_counter_names[id] = name_label
		_counter_values[id] = value_label

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
	_hud_root.add_child(_nav)

	top.resized.connect(_refit)
	get_viewport().size_changed.connect(_refit)

func _label(font_size: int) -> Label:
	var label := Label.new()
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	label.add_theme_constant_override("outline_size", 8)
	return label

func _apply_language(lang: String) -> void:
	TranslationServer.set_locale(lang)
	for l: String in _language_buttons:
		_language_buttons[l].text = Loc.t("language." + l)
	_refresh_names()
	for id: String in _nav_buttons:
		_nav_buttons[id].text = Loc.t("nav." + id)
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
	for id: String in amounts:
		_counter_values[id].text = Fmt.amount(lang, amounts[id])
	if _screen == "base":
		_base.update(now, amounts)
