class_name RoundButton
extends VBoxContainer
## A round HUD button with its label under it: the bottom row's Heroes, Alliance and Reports (44 mockup px) and the Base/Map
## switch (66 px), on the painted bronze ring. A one-dot badge sits at the top end of the button; it hides by alpha,
## never by `visible`, so the row keeps its height. The label sits on a soft shadow so it reads on the light ground too.

signal pressed

## The ring of the open page's button glows.
const ACTIVE_TINT := Color(1.45, 1.3, 1.05)

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
	# The icon rides on the face: it sinks with it.
	_button.button_down.connect(_place_icon.bind(true))
	_button.button_up.connect(_place_icon.bind(false))
	_icon = HudIcon.new(icon_name, diameter * (0.6 if big else 0.64))
	_icon.set_anchors_preset(Control.PRESET_CENTER)
	_icon.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_icon.grow_vertical = Control.GROW_DIRECTION_BOTH
	_place_icon(false)
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

## Puts the icon on the face's middle: above the lip, or where the pressed face sinks to (the piece's 256 px drawing). Set whole, never
## nudged, so a relayout during a press can't leave it off its place.
func _place_icon(down: bool) -> void:
	var unit := HudTheme.px(_diameter) / 256.0
	var lift := (1.0 if down else -9.0) * unit
	var half := _icon.custom_minimum_size.y * 0.5
	_icon.offset_top = lift - half
	_icon.offset_bottom = lift + half

func icon_lift() -> float:
	return (_icon.offset_top + _icon.offset_bottom) * 0.5

func _apply_style() -> void:
	HudTheme.make_round(_button, "round_big" if _big else "round")
	_button.self_modulate = ACTIVE_TINT if _active else Color.WHITE

func set_label(text: String) -> void:
	_label.text = text

## The label on a dark plate with a bronze hairline, in bold: for buttons over the busy camp painting (the action ring).
func use_plate() -> void:
	var plate := HudTheme.tag(HudTheme.px(7), HudTheme.px(2))
	_label.add_theme_stylebox_override("normal", plate)
	_label.add_theme_constant_override("outline_size", 0)
	_label.add_theme_font_override("font", load(UiKit.BOLD))
	_label.add_theme_font_size_override("font_size", HudTheme.font(UiKit.SMALL))
	_label.size_flags_horizontal = Control.SIZE_SHRINK_CENTER

func set_icon(icon_name: String) -> void:
	_icon.set_icon(icon_name)

## Marks the button of the page that is open (a brighter ring).
## It tints the button only, so the icon on it stays as it is.
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
