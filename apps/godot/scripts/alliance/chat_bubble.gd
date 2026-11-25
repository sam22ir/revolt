class_name ChatBubble
extends HBoxContainer
## One chat line: the sender, rank and time over the text in a bubble, the player's own green at the reading end, the others' dark at the
## start. The text is player text: a plain label, never markup. Short lines make short bubbles; long ones wrap.

const MINE := Color("4a6325")
const THEIRS := Color("4a3522")
## The widest a bubble gets, in viewport px (of a 1080 px page).
const WIDEST := 720.0

func _init(meta: String, text: String, mine: bool) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	alignment = BoxContainer.ALIGNMENT_END if mine else BoxContainer.ALIGNMENT_BEGIN
	var bubble := PanelContainer.new()
	bubble.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := HudTheme.flat(MINE if mine else THEIRS, 12.0, HudTheme.BUTTON_INK, 1.6)
	box.content_margin_left = HudTheme.px(11)
	box.content_margin_right = HudTheme.px(11)
	box.content_margin_top = HudTheme.px(5)
	box.content_margin_bottom = HudTheme.px(7)
	bubble.add_theme_stylebox_override("panel", box)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 0)
	var head := UiKit.label(meta, UiKit.SMALL, HudTheme.GOLD if mine else HudTheme.RING, true)
	head.text_direction = Control.TEXT_DIRECTION_INHERITED # it begins with a Latin handle and still reads from the page's start
	column.add_child(head)
	var words := UiKit.label(text, UiKit.BODY + 1.0, HudTheme.BUTTON_TEXT, false, true)
	var font := words.get_theme_font("font")
	var size_px := HudTheme.font(UiKit.BODY + 1.0)
	words.custom_minimum_size.x = minf(font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px).x * 1.06 + 6.0, WIDEST)
	column.add_child(words)
	bubble.add_child(column)
	add_child(bubble)
