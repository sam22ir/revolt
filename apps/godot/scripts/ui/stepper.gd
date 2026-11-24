class_name Stepper
extends HBoxContainer
## A count for the thumb: − , a number field, + and Max, kept between 1 and `maximum`. The field is never rewritten while it has
## focus; what is typed counts at once, and the field shows the kept value when it loses focus.

signal changed(value: int)

var value := 1
var maximum := 1
var _minus := Button.new()
var _input := LineEdit.new()
var _plus := Button.new()
var _max_button := Button.new()

func _init() -> void:
	add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	_minus.text = "−"
	_plus.text = "+"
	for b: Button in [_minus, _plus, _max_button]:
		b.focus_mode = Control.FOCUS_NONE
		b.add_theme_font_size_override("font_size", HudTheme.font(UiKit.BODY))
		b.add_theme_font_override("font", load(UiKit.BOLD))
		b.custom_minimum_size = Vector2(UiKit.TAP, UiKit.TAP) * HudTheme.SCALE
	for b: Button in [_minus, _plus]:
		b.add_theme_font_size_override("font_size", HudTheme.font(UiKit.BIG))
	_max_button.custom_minimum_size.x = HudTheme.px(64)
	_input.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_input.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_NUMBER
	_input.max_length = 6
	_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_input.add_theme_font_size_override("font_size", HudTheme.font(UiKit.BIG))
	_input.add_theme_font_override("font", load(UiKit.BOLD))
	_input.add_theme_color_override("font_color", HudTheme.TEXT)
	_input.add_theme_stylebox_override("normal", HudTheme.inset())
	var focus := HudTheme.inset()
	focus.frame_tint = Color(1.35, 1.25, 1.0)
	_input.add_theme_stylebox_override("focus", focus)
	_input.text_changed.connect(func(text: String) -> void:
		if text.is_valid_float():
			_keep(text.to_float()))
	_input.text_submitted.connect(func(_text: String) -> void: _input.release_focus())
	_input.focus_exited.connect(func() -> void: set_value(_input.text.to_float()))
	_minus.pressed.connect(func() -> void: set_value(value - 1))
	_plus.pressed.connect(func() -> void: set_value(value + 1))
	_max_button.pressed.connect(func() -> void: set_value(maximum))
	add_child(_minus)
	add_child(_input)
	add_child(_plus)
	add_child(_max_button)
	_show()

## A new upper limit; the value is clamped to it.
func set_maximum(most: int) -> void:
	maximum = most
	_keep(value)
	if not _input.has_focus():
		_show()

func set_value(to: float) -> void:
	_keep(to)
	_show()

## The texts of the language: "Max" and the hints of the buttons and the field.
func retranslate(hint: String) -> void:
	_max_button.text = Loc.t("panel.max")
	_minus.tooltip_text = Loc.t("panel.less")
	_plus.tooltip_text = Loc.t("panel.more")
	_input.tooltip_text = hint

func _keep(to: float) -> void:
	var before := value
	value = TrainingModel.clamp_count(to, maximum)
	_minus.disabled = value <= 1
	_plus.disabled = value >= maximum
	_max_button.disabled = value >= maximum
	if value != before:
		changed.emit(value)

func _show() -> void:
	_input.text = str(value)
	_keep(value)
