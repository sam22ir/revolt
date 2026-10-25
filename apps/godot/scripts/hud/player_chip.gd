class_name PlayerChip
extends Button
## The player chip at the start edge of the top bar (look test): avatar, level and power. Tapping it opens Settings.

var _level := Label.new()
var _power := Label.new()

func _init() -> void:
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	focus_mode = Control.FOCUS_NONE
	for state in ["normal", "hover", "pressed", "focus"]:
		add_theme_stylebox_override(state, HudTheme.panel(HudTheme.RADIUS, 6.0, 4.0))
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(7)))
	row.set_anchors_preset(Control.PRESET_FULL_RECT)
	row.offset_left = HudTheme.px(6)
	row.offset_right = -HudTheme.px(6)
	var avatar := Panel.new()
	avatar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	avatar.custom_minimum_size = Vector2.ONE * HudTheme.px(34)
	avatar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	avatar.add_theme_stylebox_override("panel", HudTheme.round_style(HudTheme.TERRACOTTA, HudTheme.RING, 34.0))
	var face := HudIcon.new("avatar", 24.0, HudTheme.TEXT)
	face.set_anchors_preset(Control.PRESET_FULL_RECT)
	avatar.add_child(face)
	row.add_child(avatar)
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", 0)
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	_level.add_theme_font_override("font", load("res://fonts/IBMPlexSansArabic-Bold.ttf"))
	_level.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_BODY))
	_power.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_SMALL - 1))
	_power.add_theme_color_override("font_color", HudTheme.TEXT_SECOND)
	for label in [_level, _power]:
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(label)
	row.add_child(column)
	# A Button does not size to a child row, so the row's minimum size is set on the button.
	add_child(row)
	custom_minimum_size = Vector2(HudTheme.px(112), HudTheme.px(46))

func set_values(level: int, power: int) -> void:
	var lang := Fmt.lang()
	_level.text = Loc.t("hud.level", {"level": Fmt.amount(lang, level)})
	_power.text = Loc.t("hud.power", {"amount": Fmt.amount(lang, power)})

func level_text() -> String:
	return _level.text

func power_text() -> String:
	return _power.text
