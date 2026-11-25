class_name PlayerChip
extends Button
## The player at the start edge of the top bar: a big round portrait in a wooden ring with the level on an amber badge at its corner, the
## player's name in bold and their power beside a sword. Tapping it opens Settings; the portrait squeezes a little under the finger.

const HEIGHT := 45.0
const WIDTH := 128.0
const PORTRAIT := 45.0
const BADGE := 21.0

var _level := UiKit.label("", UiKit.SMALL, HudTheme.ON_GOLD, true)
var _name := UiKit.label("", UiKit.BODY + 1.0, HudTheme.BUTTON_TEXT, true)
var _power := UiKit.label("", UiKit.BODY, HudTheme.RING, true)
var _portrait := Control.new()
var _tag := ""

func _init() -> void:
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	focus_mode = Control.FOCUS_NONE
	for state in ["normal", "hover", "pressed", "hover_pressed", "focus"]:
		add_theme_stylebox_override(state, StyleBoxEmpty.new())
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	row.set_anchors_preset(Control.PRESET_FULL_RECT)
	row.add_child(_build_portrait())
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", -roundi(HudTheme.px(3)))
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_name.clip_text = true
	_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	column.add_child(_name)
	var power_row := HBoxContainer.new()
	power_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	power_row.add_theme_constant_override("separation", roundi(HudTheme.px(3)))
	var sword := HudIcon.new("power", 21.0)
	sword.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	power_row.add_child(sword)
	_power.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	power_row.add_child(_power)
	column.add_child(power_row)
	row.add_child(column)
	# A Button does not size to a child row, so the row's minimum size is set on the button.
	add_child(row)
	custom_minimum_size = Vector2(WIDTH, HEIGHT) * HudTheme.SCALE
	button_down.connect(_press.bind(true))
	button_up.connect(_press.bind(false))

## The round portrait with the level badge over its bottom-start corner.
func _build_portrait() -> Control:
	_portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_portrait.custom_minimum_size = Vector2.ONE * HudTheme.px(PORTRAIT)
	_portrait.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_portrait.pivot_offset = _portrait.custom_minimum_size * 0.5
	_portrait.add_child(UiKit.avatar(PORTRAIT))
	var badge := PanelContainer.new()
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := HudTheme.round_style(HudTheme.GOLD, HudTheme.BUTTON_INK, BADGE, 2.0)
	box.content_margin_left = HudTheme.px(4)
	box.content_margin_right = HudTheme.px(4)
	box.content_margin_top = 0.0
	box.content_margin_bottom = 0.0
	badge.add_theme_stylebox_override("panel", box)
	badge.custom_minimum_size = Vector2.ONE * HudTheme.px(BADGE)
	_level.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_level.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	badge.add_child(_level)
	# Bottom-end corner of the portrait, by its name (the holder mirrors in Arabic, the badge's anchors follow).
	badge.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	badge.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	badge.grow_vertical = Control.GROW_DIRECTION_BEGIN
	badge.offset_right = HudTheme.px(5)
	badge.offset_bottom = HudTheme.px(1)
	badge.offset_left = badge.offset_right - HudTheme.px(BADGE)
	badge.offset_top = badge.offset_bottom - HudTheme.px(BADGE)
	_portrait.add_child(badge)
	return _portrait

func _press(down: bool) -> void:
	if is_inside_tree():
		create_tween().tween_property(_portrait, "scale", Vector2.ONE * (0.92 if down else 1.0), 0.1)

func set_values(level: int, power: int) -> void:
	var lang := Fmt.lang()
	_level.text = Fmt.amount(lang, level)
	_power.text = Fmt.amount(lang, power)

## The player's name in the chip: their guest tag (#BAF466) until they link an account; Settings says "Guest #BAF466" in full.
func set_tag(tag: String) -> void:
	_tag = tag
	_name.text = _tag

func level_text() -> String:
	return _level.text

func power_text() -> String:
	return _power.text

func name_text() -> String:
	return _name.text
