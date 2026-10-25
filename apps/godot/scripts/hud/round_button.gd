class_name RoundButton
extends VBoxContainer
## A round HUD button with its label under it (look test): the bottom row's Heroes, Alliance and Reports (44 mockup px) and the
## Base/Map switch (66 px, terracotta with a sand ring). A one-dot badge sits at the top end of the button; it hides by alpha,
## never by `visible`, so the row keeps its height. The label sits on a soft shadow so it reads on the light ground too.

signal pressed

var _button := Button.new()
var _icon: HudIcon
var _label := Label.new()
var _dot := Panel.new()
var _diameter := 44.0
var _big := false
var _active := false

func _init(icon_name := "", diameter := 44.0, big := false) -> void:
	_diameter = diameter
	_big = big
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	add_theme_constant_override("separation", roundi(HudTheme.px(2)))
	_button.focus_mode = Control.FOCUS_NONE
	_button.custom_minimum_size = Vector2.ONE * HudTheme.px(diameter)
	_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_button.pressed.connect(func() -> void: pressed.emit())
	_icon = HudIcon.new(icon_name, diameter * (0.5 if big else 0.52), HudTheme.TEXT)
	_icon.set_anchors_preset(Control.PRESET_CENTER)
	_icon.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_icon.grow_vertical = Control.GROW_DIRECTION_BOTH
	_button.add_child(_icon)
	_dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dot.custom_minimum_size = Vector2.ONE * HudTheme.px(11)
	_dot.size = _dot.custom_minimum_size
	_dot.add_theme_stylebox_override("panel", HudTheme.round_style(HudTheme.ALERT, HudTheme.TEXT, 11.0, 1.5))
	_dot.modulate.a = 0.0
	_button.add_child(_dot)
	add_child(_button)
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_SMALL))
	_label.add_theme_color_override("font_color", HudTheme.TEXT)
	_label.add_theme_color_override("font_outline_color", Color(0.15, 0.1, 0.07, 0.9))
	_label.add_theme_constant_override("outline_size", roundi(HudTheme.px(3)))
	add_child(_label)
	_apply_style()
	place_dot("en")

func _apply_style() -> void:
	var fill := HudTheme.TERRACOTTA if _big else HudTheme.PANEL
	var ring := HudTheme.RING if (_big or _active) else HudTheme.BRASS
	var width := 2.5 if _big else (2.0 if _active else HudTheme.BORDER)
	var box := HudTheme.round_style(fill, ring, _diameter, width)
	for state in ["normal", "hover", "pressed", "focus"]:
		_button.add_theme_stylebox_override(state, box)

func set_label(text: String) -> void:
	_label.text = text

func set_icon(icon_name: String) -> void:
	_icon.set_icon(icon_name)

## Marks the button of the page that is open (a brighter ring).
func set_active(active: bool) -> void:
	_active = active
	_apply_style()

func set_dot(shown: bool) -> void:
	_dot.modulate.a = 1.0 if shown else 0.0

## The dot sits at the top end of the button: anchors do not follow the layout direction, so it is put by language.
func place_dot(lang: String) -> void:
	var side := HudTheme.px(_diameter) - HudTheme.px(11) - HudTheme.px(1)
	_dot.position = Vector2(HudTheme.px(1) if lang == "ar" else side, HudTheme.px(1))

func is_dot_shown() -> bool:
	return _dot.modulate.a > 0.0

func label_text() -> String:
	return _label.text

func icon_name() -> String:
	return _icon.icon_name

func button() -> Button:
	return _button
