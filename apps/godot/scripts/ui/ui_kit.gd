class_name UiKit
extends RefCounted
## The shared pieces of the screens (docs/design/ui-pass-plan.md): text at the kit's sizes, cards, cost and time chips, stat rows
## with a "now → next" value, the main button and building portraits cut from the camp painting. Lengths are mockup px (HudTheme).
## A screen moves to these sizes when it moves to the kit, so the older screens keep theirs until then.

const BODY := 14.0
const SMALL := 12.0
const TITLE := 18.0
const BIG := 20.0
## The main button's height and the smallest tap target, in mockup px.
const BUTTON := 50.0
const TAP := 44.0
const BOLD := "res://fonts/IBMPlexSansArabic-Bold.ttf"


static func label(text: String, size := BODY, color := HudTheme.TEXT, bold := false, wrap := false) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", HudTheme.font(size))
	l.add_theme_color_override("font_color", color)
	if bold:
		l.add_theme_font_override("font", load(BOLD))
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

## A stitched leather section. Add rows to the returned card's first child (a VBoxContainer).
static func card(title := "") -> PanelContainer:
	var c := PanelContainer.new()
	c.mouse_filter = Control.MOUSE_FILTER_PASS # a drag on a card scrolls the page it is on
	var box := HudTheme.card()
	c.add_theme_stylebox_override("panel", box)
	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	c.add_child(body)
	if title != "":
		body.add_child(label(title, BODY, HudTheme.RING, true))
	return c

## A card headed by an icon and a title, with a groove under them. Add to `card_body`; `section_head` is the heading's row (put a
## trailing value at its end) and `section_title` its label.
static func section(icon_name: String, title := "") -> PanelContainer:
	var c := card()
	var body := card_body(c)
	body.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	var icon := HudIcon.new(icon_name, 26.0)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(icon)
	var text := label(title, BODY + 1.0, HudTheme.RING, true)
	text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(text)
	body.add_child(head)
	body.add_child(divider())
	return c

static func section_head(c: PanelContainer) -> HBoxContainer:
	return card_body(c).get_child(0) as HBoxContainer

static func section_title(c: PanelContainer) -> Label:
	return section_head(c).get_child(1) as Label

## A value at the end of a section's heading.
static func section_value(c: PanelContainer, text: String) -> Label:
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	section_head(c).add_child(spacer)
	var value := label(text, SMALL, HudTheme.TEXT_SECOND)
	value.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	section_head(c).add_child(value)
	return value

## A small solid badge with a word on it (a result), in `colour`.
static func badge(text: String, colour: Color) -> PanelContainer:
	var b := PanelContainer.new()
	var box := HudTheme.flat(colour, 9.0, HudTheme.BUTTON_INK, 1.4)
	box.content_margin_left = HudTheme.px(8)
	box.content_margin_right = HudTheme.px(8)
	box.content_margin_top = HudTheme.px(1)
	box.content_margin_bottom = HudTheme.px(2)
	b.add_theme_stylebox_override("panel", box)
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(label(text, SMALL, HudTheme.BUTTON_TEXT, true))
	return b

## A thin groove across a card, under its heading.
static func divider() -> Control:
	var line := Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0, 0, 0, 0.38)
	box.border_color = Color(1.0, 0.85, 0.6, 0.13)
	box.border_width_bottom = 2
	line.add_theme_stylebox_override("panel", box)
	line.custom_minimum_size.y = 5.0
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return line

## The player's round avatar in a wooden ring, `size` mockup px across.
static func avatar(size := 64.0) -> Control:
	var holder := Panel.new()
	holder.custom_minimum_size = Vector2.ONE * HudTheme.px(size)
	holder.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_theme_stylebox_override("panel", HudTheme.round_style(HudTheme.TERRACOTTA, Color("b58a5a"), size, 3.0))
	var face := HudIcon.new("avatar", size)
	face.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, roundi(HudTheme.px(3)))
	holder.add_child(face)
	return holder

static func card_body(c: PanelContainer) -> VBoxContainer:
	return c.get_child(0) as VBoxContainer

## A resource amount as an icon and a number; a lacking one is in LACKING.
static func cost_chip(resource_id: String, amount: String, lacking: bool) -> PanelContainer:
	var icon := HudIcon.new(resource_id, 24.0)
	return _chip(icon, label(amount, BODY, HudTheme.LACKING if lacking else HudTheme.TEXT, true))

## Changes a cost or time chip in place (for chips that follow a count every frame).
static func set_chip(chip: PanelContainer, text: String, lacking := false) -> void:
	var value := chip.get_child(0).get_child(1) as Label
	value.text = text
	value.add_theme_color_override("font_color", HudTheme.LACKING if lacking else HudTheme.TEXT)

## A duration as a clock and the time.
static func time_chip(text: String) -> PanelContainer:
	return _chip(HudIcon.new("clock", 22.0), label(text, BODY, HudTheme.TEXT, true))

## A troop's round medallion (art/icons/troop_*.svg).
static func troop_medallion(troop: String, size := 46.0) -> HudIcon:
	return HudIcon.new("troop_" + troop, size)

## A small icon (HudIcon) and a text in a dark pill, such as "At home 10".
static func stat_chip(icon_name: String, text: String) -> PanelContainer:
	return _chip(HudIcon.new(icon_name, 22.0), label(text, SMALL, HudTheme.TEXT, true))

static func _chip(icon: Control, value: Label) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := HudTheme.pill()
	chip.add_theme_stylebox_override("panel", box)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(5)))
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(icon)
	row.add_child(value)
	chip.add_child(row)
	return chip

## A row of chips that wraps on narrow screens.
static func chips(items: Array) -> HFlowContainer:
	var flow := HFlowContainer.new()
	flow.add_theme_constant_override("h_separation", roundi(HudTheme.px(6)))
	flow.add_theme_constant_override("v_separation", roundi(HudTheme.px(6)))
	for item: Control in items:
		flow.add_child(item)
	return flow

## Icon (or null), label, value and, for an upgrade, the arrow and the next value in gold. Returns the row; its value label is
## named "Value" so a caller can update it in place.
static func stat_row(icon: Control, text: String, value: String, next_value := "") -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	if icon != null:
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(icon)
	var name := label(text, BODY, HudTheme.TEXT_SECOND)
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(name)
	var v := label(value, BODY, HudTheme.TEXT, true)
	v.name = "Value"
	row.add_child(v)
	if next_value != "":
		row.add_child(label(arrow(), BODY, HudTheme.TEXT_SECOND))
		row.add_child(label(next_value, BODY, HudTheme.GOLD, true))
	return row

## The arrow from now to next in the reading direction.
static func arrow() -> String:
	return "←" if Fmt.lang() == "ar" else "→"

## The screen's one main action: green, full width, a thumb's height.
static func primary_button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", HudTheme.font(BIG - 2.0))
	b.add_theme_font_override("font", load(BOLD))
	b.custom_minimum_size.y = HudTheme.px(BUTTON)
	HudTheme.make_primary(b)
	return b

## Gold on a dark track; the fill starts at the layout's start side, so it runs right to left in Arabic.
static func progress_bar() -> ProgressBar:
	var bar := ProgressBar.new()
	bar.show_percentage = false
	bar.custom_minimum_size.y = HudTheme.px(12)
	bar.value = 0.0
	bar.add_theme_stylebox_override("background", HudTheme.progress_track())
	bar.add_theme_stylebox_override("fill", HudTheme.progress_fill())
	return bar

## A short warning line with a lock: why an action is blocked.
static func warning(text: String) -> PanelContainer:
	var c := PanelContainer.new()
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := HudTheme.flat(Color(HudTheme.LACKING, 0.12), 6.0, Color(HudTheme.LACKING, 0.6), 1.0)
	c.add_theme_stylebox_override("panel", box)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	var lock := HudIcon.new("lock", 24.0)
	lock.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(lock)
	var text_label := label(text, BODY, HudTheme.LACKING, false, true)
	text_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(text_label)
	c.add_child(row)
	return c

static func set_warning(warning_line: PanelContainer, text: String) -> void:
	(warning_line.get_child(0).get_child(1) as Label).text = text

## The building as it stands in the camp at `level`, framed.
static func portrait(id: String, size := 64.0, level := 1) -> PanelContainer:
	var frame := PanelContainer.new()
	var box := StyleBoxEmpty.new()
	frame.add_theme_stylebox_override("panel", box)
	var pic := TextureRect.new()
	pic.texture = portrait_texture(id, level)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	pic.custom_minimum_size = Vector2.ONE * HudTheme.px(size)
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_child(pic)
	# The frame goes over the picture's edge.
	var rim := Panel.new()
	rim.add_theme_stylebox_override("panel", HudTheme.framed("frame_portrait", 34.0, "", 0.0, 0.0))
	rim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_child(rim)
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return frame

## A building's picture on the cards: the look it has at `level`.
static func portrait_texture(id: String, level: int = 1) -> Texture2D:
	return CampArt.card(id, CampArt.look_for(level))
