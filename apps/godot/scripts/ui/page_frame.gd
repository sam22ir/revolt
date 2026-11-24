class_name PageFrame
extends Control
## A full page of the kit: the backdrop, a title band (back button at the start edge, the page's icon, its title) and a scrolling body
## inside the pole frame. Put sections in `body`.

signal back_pressed

var body := VBoxContainer.new()
var scroll := ScrollContainer.new()
var _back := Button.new()
var _back_icon := HudIcon.new("back", 22.0)
var _title := UiKit.label("", UiKit.TITLE + 2.0, HudTheme.TEXT, true)

func _init(icon_name := "") -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(PageBackdrop.new())
	var page := VBoxContainer.new()
	page.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, roundi(HudTheme.px(PageBackdrop.MARGIN - 2.0)))
	page.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	add_child(page)
	page.add_child(_title_band(icon_name))
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	page.add_child(scroll)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", roundi(HudTheme.px(7)))
	scroll.add_child(body)

func _title_band(icon_name: String) -> Control:
	var band := PanelContainer.new()
	var box := HudTheme.framed("frame_card", 48.0, "board", 8.0, 7.0)
	box.inset = 8.0
	band.add_theme_stylebox_override("panel", box)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	band.add_child(row)
	_back.custom_minimum_size = Vector2.ONE * HudTheme.px(UiKit.TAP + 2.0)
	_back.focus_mode = Control.FOCUS_NONE
	HudTheme.dress(_back, "wood")
	_back.pressed.connect(func() -> void: back_pressed.emit())
	_back.button_down.connect(_place_back_icon.bind(true))
	_back.button_up.connect(_place_back_icon.bind(false))
	_place_back_icon(false)
	_back.add_child(_back_icon)
	row.add_child(_back)
	if icon_name != "":
		var icon := HudIcon.new(icon_name, 36.0)
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(icon)
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_title.clip_text = true
	row.add_child(_title)
	return band

## Keeps the arrow on the button's face: above the lip, or lower while it is pressed.
func _place_back_icon(down: bool) -> void:
	_back_icon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, roundi(HudTheme.px(9)))
	var shift := (HudTheme.PRESS if down else 0.0) - HudTheme.LIP * 0.5
	_back_icon.offset_top += shift
	_back_icon.offset_bottom += shift

func set_title(text: String, back_hint: String) -> void:
	_title.text = text
	_back.tooltip_text = back_hint
	_back_icon.flip_h = Fmt.lang() == "ar"

func title_text() -> String:
	return _title.text

func back_button() -> Button:
	return _back
