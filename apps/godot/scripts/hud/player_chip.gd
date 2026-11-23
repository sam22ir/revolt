class_name PlayerChip
extends Button
## The player chip at the start edge of the top bar: the avatar in a bronze ring with the player's level on a gold badge at its
## corner, then the player's name and their power beside a sword. Tapping it opens Settings.

var _level := Label.new()
var _name := Label.new()
var _power := Label.new()
var _tag := ""

func _init() -> void:
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	focus_mode = Control.FOCUS_NONE
	for state in ["normal", "hover", "pressed", "focus"]:
		add_theme_stylebox_override(state, HudTheme.panel(HudTheme.RADIUS, 6.0, 4.0))
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(7)))
	row.set_anchors_preset(Control.PRESET_FULL_RECT)
	row.offset_left = HudTheme.px(4)
	row.offset_right = -HudTheme.px(6)
	row.add_child(_avatar())
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", 0)
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_name.add_theme_font_override("font", load(UiKit.BOLD))
	_name.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_SMALL + 1.0))
	_name.clip_text = true
	_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_name.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(_name)
	var power_row := HBoxContainer.new()
	power_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	power_row.add_theme_constant_override("separation", roundi(HudTheme.px(3)))
	# A flat SVG, not the painted medallion: it has to read at this size.
	var sword := HudIcon.new("power", 15.0, HudTheme.RING)
	sword.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	power_row.add_child(sword)
	_power.add_theme_font_override("font", load(UiKit.BOLD))
	_power.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_SMALL))
	_power.add_theme_color_override("font_color", HudTheme.TEXT_SECOND)
	_power.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_power.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	power_row.add_child(_power)
	column.add_child(power_row)
	row.add_child(column)
	# A Button does not size to a child row, so the row's minimum size is set on the button.
	add_child(row)
	custom_minimum_size = Vector2(HudTheme.px(118), HudTheme.px(46))

## The round avatar with the gold level badge over its bottom-start corner.
func _avatar() -> Control:
	var holder := Control.new()
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.custom_minimum_size = Vector2.ONE * HudTheme.px(40)
	holder.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var avatar := Panel.new()
	avatar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	avatar.set_anchors_preset(Control.PRESET_FULL_RECT)
	avatar.add_theme_stylebox_override("panel", HudTheme.round_style(HudTheme.TERRACOTTA, HudTheme.RING, 40.0, 2.0))
	var face := HudIcon.new("avatar", 28.0, HudTheme.TEXT)
	face.set_anchors_preset(Control.PRESET_FULL_RECT)
	avatar.add_child(face)
	holder.add_child(avatar)
	var badge := PanelContainer.new()
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := HudTheme.round_style(HudTheme.GOLD, HudTheme.ON_GOLD, 18.0, 1.5)
	box.content_margin_left = HudTheme.px(4)
	box.content_margin_right = HudTheme.px(4)
	badge.add_theme_stylebox_override("panel", box)
	badge.custom_minimum_size = Vector2.ONE * HudTheme.px(18)
	_level.add_theme_font_override("font", load(UiKit.BOLD))
	_level.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_SMALL))
	_level.add_theme_color_override("font_color", HudTheme.ON_GOLD)
	_level.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_level.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_level.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.add_child(_level)
	# Bottom-start corner, a little outside the ring (the holder mirrors in Arabic, the badge's anchors follow).
	badge.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	badge.offset_left = -HudTheme.px(3)
	badge.offset_top = -HudTheme.px(16)
	holder.add_child(badge)
	return holder

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
