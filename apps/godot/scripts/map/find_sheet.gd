class_name FindSheet
extends PanelContainer
## The Find sheet over the map, opened from the coordinates plate: the nearest target of a level (Next walks outward), a tile by its
## coordinates, and camps by tag. It sends nothing to the server; it asks the screen to look at a tile.

signal closed
## Look at this tile (and select it).
signal go(tile: Vector2i)

const LEVELS := 4

var _snapshot: Dictionary = {}
var _from := Vector2i.ZERO
var _level := 1
var _next := 0
var _x := LineEdit.new()
var _y := LineEdit.new()
var _tag := LineEdit.new()
var _coords_note: Label
var _target_note: Label
var _camps := VBoxContainer.new()
var _body := VBoxContainer.new()

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	visible = false
	add_theme_stylebox_override("panel", HudTheme.sheet(21.0, 19.0))
	_body.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	add_child(_body)
	_build()

## Opens on the current map, searching outward from `from` (the camera's tile).
func open(snapshot: Dictionary, from: Vector2i) -> void:
	_snapshot = snapshot
	_from = from
	_next = 0
	_coords_note.text = ""
	_target_note.text = ""
	visible = true
	_show_camps()

func close() -> void:
	visible = false
	for f: LineEdit in [_x, _y, _tag]:
		f.release_focus()

## Rebuilds the texts in the current language.
func refresh() -> void:
	for c in _body.get_children():
		c.queue_free()
	_x = LineEdit.new()
	_y = LineEdit.new()
	_tag = LineEdit.new()
	_camps = VBoxContainer.new()
	_build()
	if visible:
		_show_camps()

func _build() -> void:
	var head := HBoxContainer.new()
	var title := UiKit.label(Loc.t("map.findTitle"), UiKit.TITLE, HudTheme.TEXT, true)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	var close_button := Button.new()
	close_button.text = "×"
	close_button.tooltip_text = Loc.t("panel.close")
	close_button.focus_mode = Control.FOCUS_NONE
	close_button.add_theme_font_size_override("font_size", HudTheme.font(UiKit.BIG + 2.0))
	close_button.custom_minimum_size = Vector2.ONE * HudTheme.px(UiKit.TAP)
	HudTheme.make_round(close_button, "round_red")
	close_button.pressed.connect(func() -> void: closed.emit())
	head.add_child(close_button)
	_body.add_child(head)

	# The nearest target of a level.
	_body.add_child(UiKit.label(Loc.t("search.title"), UiKit.SMALL, HudTheme.TEXT_SECOND, true))
	var levels := HBoxContainer.new()
	levels.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	for level in range(1, LEVELS + 1):
		var b := _button(Loc.t("search.level", {"level": Fmt.amount(Fmt.lang(), level)}), "wood")
		b.pressed.connect(func() -> void: _find_target(level))
		levels.add_child(b)
	_body.add_child(levels)
	_target_note = UiKit.label("", UiKit.SMALL, HudTheme.LACKING, false, true)
	_body.add_child(_target_note)

	# A tile by its coordinates.
	_body.add_child(UiKit.label(Loc.t("map.coordsTitle"), UiKit.SMALL, HudTheme.TEXT_SECOND, true))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	for pair: Array in [[Loc.t("map.x"), _x], [Loc.t("map.y"), _y]]:
		row.add_child(UiKit.label(String(pair[0]), UiKit.BODY, HudTheme.TEXT, true))
		var f: LineEdit = pair[1]
		_field(f, 3)
		f.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_NUMBER
		f.text_submitted.connect(func(_t: String) -> void: _go_coords())
		row.add_child(f)
	var go_button := _button(Loc.t("map.goTo"), "green")
	go_button.pressed.connect(_go_coords)
	row.add_child(go_button)
	_body.add_child(row)
	_coords_note = UiKit.label("", UiKit.SMALL, HudTheme.LACKING, false, true)
	_body.add_child(_coords_note)

	# Camps by tag.
	_body.add_child(UiKit.label(Loc.t("map.campTitle"), UiKit.SMALL, HudTheme.TEXT_SECOND, true))
	_field(_tag, 12)
	_tag.placeholder_text = Loc.t("map.campHint")
	# Direction from the text itself: the Arabic hint reads right to left, a typed tag (Latin letters and digits) left to right.
	_tag.text_direction = Control.TEXT_DIRECTION_AUTO
	_tag.text_changed.connect(func(_t: String) -> void: _show_camps())
	_body.add_child(_tag)
	_camps.add_theme_constant_override("separation", roundi(HudTheme.px(4)))
	_body.add_child(_camps)

func _field(f: LineEdit, max_length: int) -> void:
	f.max_length = max_length
	f.alignment = HORIZONTAL_ALIGNMENT_CENTER
	f.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	f.custom_minimum_size.y = HudTheme.px(UiKit.TAP)
	f.add_theme_font_size_override("font_size", HudTheme.font(UiKit.BODY + 2.0))
	f.add_theme_stylebox_override("normal", HudTheme.inset())
	var focus := HudTheme.inset()
	focus.frame_tint = Color(1.35, 1.25, 1.0)
	f.add_theme_stylebox_override("focus", focus)

func _button(text: String, kind: String) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.custom_minimum_size.y = HudTheme.px(UiKit.TAP)
	b.add_theme_font_size_override("font_size", HudTheme.font(UiKit.BODY))
	HudTheme.dress(b, kind, "", true)
	return b

func _size() -> int:
	return int(_snapshot.get("size", 0))

func _go_coords() -> void:
	var x := FindModel.parse_coord(_x.text, _size())
	var y := FindModel.parse_coord(_y.text, _size())
	if x < 0 or y < 0:
		_coords_note.text = Loc.t("map.badCoords", {"max": Fmt.amount(Fmt.lang(), maxi(_size() - 1, 0))})
		return
	_coords_note.text = ""
	go.emit(Vector2i(x, y))

func _find_target(level: int) -> void:
	if level != _level:
		_level = level
		_next = 0
	var found := FindModel.targets_of_level(_snapshot.get("npcs", []), level, _from)
	if found.is_empty():
		_target_note.text = Loc.t("search.none", {"level": Fmt.amount(Fmt.lang(), level)})
		return
	_target_note.text = ""
	var n: Dictionary = found[_next % found.size()]
	_next += 1
	go.emit(Vector2i(int(n["x"]), int(n["y"])))

func _show_camps() -> void:
	for c in _camps.get_children():
		c.queue_free()
	var q := _tag.text.strip_edges()
	if q == "":
		return
	var hits := FindModel.match_camps(_snapshot.get("bases", []), q)
	if hits.is_empty():
		_camps.add_child(UiKit.label(Loc.t("map.campNone"), UiKit.SMALL, HudTheme.LACKING))
		return
	for b: Dictionary in hits:
		var text := "%s · %s" % [String(b["tag"]), Loc.t("map.coords", {"x": int(b["x"]), "y": int(b["y"])})]
		var button := _button(text, "wood")
		var tile := Vector2i(int(b["x"]), int(b["y"]))
		button.pressed.connect(func() -> void: go.emit(tile))
		_camps.add_child(button)
