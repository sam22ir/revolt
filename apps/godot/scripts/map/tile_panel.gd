class_name TilePanel
extends PanelContainer
## The sheet over the map for the tapped tile: your camp, another camp, an alliance HQ, a target (name, level, defenders, the
## rally-only note) or just land (its terrain). It draws TileModel.view and sends nothing yet (marches, rallies and the HQ come
## with their own chunks). It takes input, so a press on it never reaches the map, and it redraws only when what it shows changes.

signal closed

const FONT := 30
const SMALL := 26
const INK := Color8(0x2b, 0x2a, 0x24)
const MUTED := Color8(0x6b, 0x65, 0x52)
const GOLD := Color8(0xe0, 0xb0, 0x40)
const PAPER := Color8(0xf4, 0xea, 0xd6)
const LACKING := Color8(0xb0, 0x3a, 0x2a)

var _tile := Vector2i(-1, -1)
var _key := ""
var _body := VBoxContainer.new()

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	visible = false
	var box := StyleBoxFlat.new()
	box.bg_color = PAPER
	box.border_color = GOLD
	box.set_border_width_all(3)
	box.set_corner_radius_all(18)
	box.content_margin_left = 20
	box.content_margin_right = 20
	box.content_margin_top = 14
	box.content_margin_bottom = 14
	add_theme_stylebox_override("panel", box)
	_body.add_theme_constant_override("separation", 8)
	add_child(_body)

## Shows the panel for a tile (and forgets what was drawn).
func show_tile(tile: Vector2i) -> void:
	_tile = tile
	_key = ""
	visible = tile.x >= 0

func hide_tile() -> void:
	show_tile(Vector2i(-1, -1))

func tile() -> Vector2i:
	return _tile

## Call every frame while a tile is selected: the snapshot, the terrain under the tile and the player's own alliance name (or "").
func update_view(snapshot: Dictionary, terrain: String, own_alliance_name: String) -> void:
	if not visible:
		return
	var info := TileModel.info(snapshot, _tile.x, _tile.y, terrain)
	var key := _signature(info, own_alliance_name)
	if key == _key:
		return
	_key = key
	_render(info, own_alliance_name)

func refresh() -> void:
	_key = ""

func _signature(info: Dictionary, alliance_name: String) -> String:
	var what: Array = [info["kind"], info["terrain"]]
	for k in ["base", "hq", "npc"]:
		if info.has(k):
			what.append(JSON.stringify(info[k]))
	return "%s|%s|%s|%s|%s" % [TranslationServer.get_locale(), Loc.background_id, str(_tile), alliance_name, "|".join(what.map(func(v: Variant) -> String: return str(v)))]

func _render(info: Dictionary, own_alliance_name: String) -> void:
	for child in _body.get_children():
		_body.remove_child(child)
		child.queue_free()
	var v := TileModel.view(info, _tile.x, _tile.y, own_alliance_name)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	head.add_child(_label(String(v["title"]), FONT + 2, INK, true))
	if int(v["level"]) >= 0:
		var level := _label(Loc.t("panel.level", {"level": Fmt.amount(Fmt.lang(), v["level"])}), SMALL, MUTED)
		level.size_flags_horizontal = Control.SIZE_SHRINK_END
		head.add_child(level)
	var close := Button.new()
	close.text = "×"
	close.tooltip_text = Loc.t("panel.close")
	close.add_theme_font_size_override("font_size", FONT + 4)
	close.pressed.connect(func() -> void: closed.emit())
	head.add_child(close)
	_body.add_child(head)
	_body.add_child(_label(String(v["coords"]), SMALL, MUTED))
	_body.add_child(_label(String(v["desc"]), SMALL, INK, true))
	if String(v["alliance_name"]) != "":
		_body.add_child(_label("%s: %s" % [Loc.t("map.allianceName"), String(v["alliance_name"])], SMALL, INK, true))
	if v["defenders"] is Dictionary:
		_body.add_child(_label("%s: %s" % [Loc.t("map.defenders"), TrainingModel.troop_list(v["defenders"], Fmt.lang())], SMALL, INK, true))
	if v["rally_only"]:
		_body.add_child(_label(Loc.t("rally.needed"), SMALL, LACKING, true))

func _label(text: String, size: int, color: Color, wrap := false) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if wrap:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label
