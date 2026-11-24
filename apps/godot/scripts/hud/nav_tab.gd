class_name NavTab
extends Control
## One tab of the tab bar: a big icon over its name, filling its fifth of the bar. The open page's tab stands on a raised slab with a
## bigger icon; a `main` tab (Base/Map) always stands on the green one. A one-dot badge sits at the icon's top end. Everything is laid
## out by hand in `_layout`, so a tab never changes the bar's height.

signal pressed

const ICON := 40.0
const ICON_RAISED := 50.0
const LABEL := 20.0
## How far a raised slab stands above the bar, in mockup px.
const RISE := 9.0
const PRESS_S := 0.08
const DOT := 13.0

var _main := false
var _active := false
var _slab := Panel.new()
var _icon: HudIcon
var _label := Label.new()
var _dot := Panel.new()
var _button := Button.new()
var _dot_at_start := false
var _tween: Tween

func _init(icon_name := "", main := false) -> void:
	_main = main
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_FILL
	_slab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_slab)
	_icon = HudIcon.new(icon_name, ICON)
	add_child(_icon)
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label.clip_text = true
	_label.add_theme_font_override("font", load(UiKit.BOLD))
	_label.add_theme_font_size_override("font_size", HudTheme.font(UiKit.SMALL))
	_label.add_theme_color_override("font_outline_color", HudTheme.BUTTON_INK)
	_label.add_theme_constant_override("outline_size", roundi(HudTheme.px(2.4)))
	add_child(_label)
	_dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dot.add_theme_stylebox_override("panel", HudTheme.round_style(HudTheme.ALERT, HudTheme.TEXT, DOT, 1.5))
	_dot.modulate.a = 0.0
	add_child(_dot)
	_button.focus_mode = Control.FOCUS_NONE
	_button.set_anchors_preset(Control.PRESET_FULL_RECT)
	for state in ["normal", "hover", "pressed", "hover_pressed", "focus", "disabled"]:
		_button.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	_button.pressed.connect(func() -> void: pressed.emit())
	_button.button_down.connect(_press.bind(true))
	_button.button_up.connect(_press.bind(false))
	add_child(_button)
	resized.connect(_layout)
	_restyle()

func _restyle() -> void:
	_slab.visible = _main or _active
	_slab.add_theme_stylebox_override("panel", HudTheme.button_box("green" if _main else "lit", false))
	_label.add_theme_color_override("font_color", HudTheme.BUTTON_TEXT if _main or _active else HudTheme.TEXT)
	_layout()

func _layout() -> void:
	var raised := _main or _active
	var rise := HudTheme.px(RISE)
	var label_h := HudTheme.px(LABEL)
	var inset := HudTheme.px(2.0)
	_slab.position = Vector2(inset, -rise)
	_slab.size = Vector2(size.x - inset * 2.0, size.y + rise - HudTheme.px(2.0))
	# The slab has a lip under its face, so what stands on it sits a little higher.
	var foot := size.y - HudTheme.px(8.0 if raised else 5.0)
	_label.position = Vector2(0.0, foot - label_h)
	_label.size = Vector2(size.x, label_h)
	var side := HudTheme.px(ICON_RAISED if raised else ICON)
	var top := -rise * 0.4 if raised else HudTheme.px(5.0)
	_icon.size = Vector2.ONE * side
	_icon.position = Vector2((size.x - side) * 0.5, (top + foot - label_h - side) * 0.5)
	_icon.pivot_offset = _icon.size * 0.5
	var dot := HudTheme.px(DOT)
	_dot.size = Vector2.ONE * dot
	var x := _icon.position.x - dot * 0.3 if _dot_at_start else _icon.position.x + side - dot * 0.7
	_dot.position = Vector2(x, _icon.position.y - dot * 0.15)

## A small squeeze under the finger, and a spring back.
func _press(down: bool) -> void:
	if not is_inside_tree():
		return
	if _tween != null:
		_tween.kill()
	_tween = create_tween()
	if not down:
		_tween.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_tween.tween_property(_icon, "scale", Vector2.ONE * (0.86 if down else 1.0), PRESS_S if down else PRESS_S * 2.5)

func set_label(text: String) -> void:
	_label.text = text

func set_icon(icon_name: String) -> void:
	_icon.set_icon(icon_name)

## Raises the tab of the page that is open.
func set_active(active: bool) -> void:
	if active != _active:
		_active = active
		_restyle()

func is_active() -> bool:
	return _active

func set_dot(shown: bool) -> void:
	_dot.modulate.a = 1.0 if shown else 0.0

## The dot sits at the icon's top end, so it changes side with the language.
func place_dot(lang: String) -> void:
	_dot_at_start = lang == "ar"
	_layout()

func is_dot_shown() -> bool:
	return _dot.modulate.a > 0.0

func label_text() -> String:
	return _label.text

func icon_name() -> String:
	return _icon.icon_name

func button() -> Button:
	return _button

## The slab under the tab, for tests.
func slab_shown() -> bool:
	return _slab.visible
