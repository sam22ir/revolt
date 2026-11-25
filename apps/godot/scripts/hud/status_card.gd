class_name StatusCard
extends PanelContainer
## The card in the screen's middle while there is nothing to show yet: what the game waits for, or why it cannot go on. It takes no
## touches.

var _icon := HudIcon.new("hourglass", 64.0)
var _label := UiKit.label("", UiKit.BODY + 1.0, HudTheme.TEXT, true, true)
var _detail := UiKit.label("", UiKit.SMALL, HudTheme.TEXT_SECOND, false, true)

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	visible = false
	add_theme_stylebox_override("panel", HudTheme.sheet(22.0, 18.0))
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	_icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	column.add_child(_icon)
	for label: Label in [_label, _detail]:
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.custom_minimum_size.x = HudTheme.px(230)
		column.add_child(label)
	add_child(column)

func show_status(icon_name: String, text: String, detail := "") -> void:
	_icon.set_icon(icon_name)
	_label.text = text
	_detail.text = detail
	_detail.visible = detail != ""
	visible = true

func text() -> String:
	return _label.text
