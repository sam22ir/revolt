class_name ListRow
extends PanelContainer
## The kit's list row: a big icon, a bold title over a quieter line, anything more under them (`extra`), and things at the end
## (`trailing`). The whole card takes the tap and darkens under the finger; a drag on it scrolls the list.

signal pressed

const ICON := 56.0

var title := UiKit.label("", UiKit.BODY + 1.0, HudTheme.BUTTON_TEXT, true)
var subtitle := UiKit.label("", UiKit.SMALL, HudTheme.TEXT_SECOND)
var extra := HFlowContainer.new()
var trailing := VBoxContainer.new()
var _up := HudTheme.card(9.0, 8.0)
var _down := HudTheme.card(9.0, 8.0)

func _init(icon_name := "") -> void:
	_down.fill_tint = Color(0.7, 0.68, 0.66)
	add_theme_stylebox_override("panel", _up)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	if icon_name != "":
		var icon := HudIcon.new(icon_name, ICON)
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(icon)
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", roundi(HudTheme.px(1)))
	for label: Label in [title, subtitle]:
		label.clip_text = true
		label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		column.add_child(label)
	extra.mouse_filter = Control.MOUSE_FILTER_IGNORE
	extra.add_theme_constant_override("h_separation", roundi(HudTheme.px(10)))
	column.add_child(extra)
	row.add_child(column)
	trailing.mouse_filter = Control.MOUSE_FILTER_IGNORE
	trailing.alignment = BoxContainer.ALIGNMENT_CENTER
	trailing.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	row.add_child(trailing)
	add_child(row)
	var tap := Button.new()
	tap.focus_mode = Control.FOCUS_NONE
	tap.mouse_filter = Control.MOUSE_FILTER_PASS
	for state in ["normal", "hover", "pressed", "hover_pressed", "focus", "disabled"]:
		tap.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	tap.pressed.connect(func() -> void: pressed.emit())
	tap.button_down.connect(func() -> void: add_theme_stylebox_override("panel", _down))
	tap.button_up.connect(func() -> void: add_theme_stylebox_override("panel", _up))
	add_child(tap)

## Colours the card's rim (a result, a rarity).
func set_rim(tint: Color) -> void:
	_up.frame_tint = tint
	_down.frame_tint = tint
