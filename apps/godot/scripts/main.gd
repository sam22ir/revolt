extends Node
## Entry scene for the world-map slice: guest session, map fetch, camera and a small HUD.
## The map (a Node2D tree) is never mirrored in Arabic; only the HUD controls follow the locale direction.

const LANGS: Array[String] = ["en", "ar", "fr"]
const FONT_SIZE := 34

var _api := Api.new()
var _clock := Clock.new()
var _world := Node2D.new()
var _map := WorldMap.new()
var _camera := MapCamera.new()
var _hud_root := Control.new()
var _status := Label.new()
var _coords := Label.new()
var _counter_names := {}
var _counter_values := {}
var _language_buttons := {}
var _resources: Dictionary = {}
var _levels: Dictionary = {}
var _liberations: Array = []
var _last_ms := 0
var _loaded := false

func _ready() -> void:
	RenderingServer.set_default_clear_color(GroundFrame.BACKGROUND)
	_api.base_url = Api.resolve_base_url()
	add_child(_api)
	add_child(_world)
	_world.add_child(_map)
	_world.add_child(_camera)
	_camera.moved.connect(_update_coords)
	_camera.moved.connect(_on_camera_moved)
	_build_hud()
	_apply_language("en")
	_start()

func _start() -> void:
	_status.text = Loc.t("map.loading")
	var session := await _api.ensure_session()
	if not session["ok"]:
		_show_error()
		return
	_apply_state(session["data"])
	var reply := await _api.get_json("/v1/map")
	if not reply["ok"]:
		_show_error()
		return
	await _map.build(reply["data"])
	_camera.bounds = Iso.world_bounds(_map.size)
	var own := _map.own_base_tile()
	if own.x >= 0:
		_camera.focus_world(Iso.tile_to_world(own.x + 1.0, own.y + 1.0))
	else:
		_camera.focus_world(Iso.tile_to_world(_map.size * 0.5, _map.size * 0.5))
	_apply_hidden_layers()
	_status.visible = false
	_loaded = true
	_update_coords()

func _apply_state(reply: Dictionary) -> void:
	var state: Dictionary = reply["state"]
	_clock.sync(int(reply["now"]), Time.get_ticks_msec())
	_resources = state["resources"]
	_levels = state["levels"]
	_last_ms = int(state["lastUpdated"])
	_liberations = reply.get("liberations", [])

## Web only: `?hide=decals,props` hides map layers, to see what each one contributes (debug aid).
func _apply_hidden_layers() -> void:
	if not OS.has_feature("web"):
		return
	var q: Variant = JavaScriptBridge.eval("new URLSearchParams(window.location.search).get('hide')")
	if q is String and q != "":
		for layer in (q as String).split(","):
			_map.set_layer_visible(layer, false)

func _show_error() -> void:
	_status.text = Loc.t("reason.unreachable")
	_status.visible = true

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	_hud_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_hud_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hud_root.layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	layer.add_child(_hud_root)

	var top := VBoxContainer.new()
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
	_coords.offset_bottom = -24
	_coords.offset_top = -24 - FONT_SIZE * 1.6
	_coords.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hud_root.add_child(_coords)

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
	for id: String in _counter_names:
		_counter_names[id].text = Loc.t("resource." + id)
	if _status.visible and not _loaded:
		_status.text = Loc.t("map.loading")
	_update_coords()

func _on_camera_moved() -> void:
	_map.set_view_zoom(_camera.view_zoom)

func _update_coords() -> void:
	var t := Iso.world_to_tile(_camera.position)
	_coords.text = Loc.t("map.coords", {"x": clampi(int(floor(t.x)), 0, maxi(_map.size - 1, 0)), "y": clampi(int(floor(t.y)), 0, maxi(_map.size - 1, 0))})
	_coords.visible = _loaded

func _process(_delta: float) -> void:
	if _resources.is_empty() or not _clock.is_synced():
		return
	var now := _clock.now_ms(Time.get_ticks_msec())
	var amounts := ResourceDisplay.amounts(_resources, _levels, _last_ms, now, _liberations)
	for id: String in amounts:
		_counter_values[id].text = str(int(floor(amounts[id])))
