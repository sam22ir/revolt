class_name UnreadBadge
extends PanelContainer
## A small red count at the top end of a button (its child, so it never changes the button's size or its row). It is hidden by
## transparency, not by `visible`, and never takes a tap. Its anchors follow the layout direction: on the right in English and French and on
## the left in Arabic.

const FONT := 35 # UiKit.SMALL in viewport px

var _label := Label.new()

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := HudTheme.flat(HudTheme.ALERT, 10.0, HudTheme.TEXT, 1.5)
	box.content_margin_left = HudTheme.px(5)
	box.content_margin_right = HudTheme.px(5)
	box.content_margin_top = 0.0
	box.content_margin_bottom = HudTheme.px(1)
	add_theme_stylebox_override("panel", box)
	_label.add_theme_font_override("font", load(UiKit.BOLD))
	_label.add_theme_color_override("font_color", Color.WHITE)
	_label.add_theme_font_size_override("font_size", FONT)
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_label)
	modulate.a = 0.0
	set_anchors_preset(Control.PRESET_TOP_RIGHT)
	grow_horizontal = Control.GROW_DIRECTION_BEGIN
	offset_top = -10
	offset_left = 4
	offset_right = 4

## The count in the language's digits; 0 hides it.
func set_count(n: int, lang: String) -> void:
	_label.text = Fmt.amount(lang, n)
	modulate.a = 1.0 if n > 0 else 0.0

func is_shown() -> bool:
	return modulate.a > 0.0

func text() -> String:
	return _label.text
