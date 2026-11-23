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
## A card is a dark inset in the bronze sheet.
const CARD_FILL := Color(0.08, 0.07, 0.05, 0.55)
const CHIP_FILL := Color(0.0, 0.0, 0.0, 0.35)
## The painting around a building's outline that its portrait also shows, in painting px.
const PORTRAIT_PAD := 24.0

static var _portraits := {}

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

## A dark inset section with a bronze hairline. Add rows to the returned card's first child (a VBoxContainer).
static func card(title := "") -> PanelContainer:
	var c := PanelContainer.new()
	var box := HudTheme.flat(CARD_FILL, 8.0, Color(HudTheme.BRASS, 0.55), 1.0)
	box.content_margin_left = HudTheme.px(12)
	box.content_margin_right = HudTheme.px(12)
	box.content_margin_top = HudTheme.px(10)
	box.content_margin_bottom = HudTheme.px(12)
	c.add_theme_stylebox_override("panel", box)
	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	c.add_child(body)
	if title != "":
		body.add_child(label(title, BODY, HudTheme.RING, true))
	return c

static func card_body(c: PanelContainer) -> VBoxContainer:
	return c.get_child(0) as VBoxContainer

## A resource amount as an icon and a number; a lacking one is in LACKING.
static func cost_chip(resource_id: String, amount: String, lacking: bool) -> PanelContainer:
	var icon := HudIcon.new(resource_id, 20.0, ResourceCell.ICON_TINT.get(resource_id, HudTheme.TEXT))
	return _chip(icon, label(amount, BODY, HudTheme.LACKING if lacking else HudTheme.TEXT, true))

## A duration as a clock and the time.
static func time_chip(text: String) -> PanelContainer:
	return _chip(ClockIcon.new(18.0, HudTheme.TEXT_SECOND), label(text, BODY, HudTheme.TEXT, true))

static func _chip(icon: Control, value: Label) -> PanelContainer:
	var chip := PanelContainer.new()
	var box := HudTheme.flat(CHIP_FILL, 14.0)
	box.content_margin_left = HudTheme.px(8)
	box.content_margin_right = HudTheme.px(10)
	box.content_margin_top = HudTheme.px(4)
	box.content_margin_bottom = HudTheme.px(4)
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

## Icon, label, value and, for an upgrade, the arrow and the next value in gold. Returns the row; its value label is named
## "Value" so a caller can update it in place.
static func stat_row(icon_name: String, tint: Color, text: String, value: String, next_value := "") -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	if icon_name != "":
		var icon := HudIcon.new(icon_name, 18.0, tint)
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

## The screen's one main action: gold, full width, a thumb's height.
static func primary_button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", HudTheme.font(BIG - 2.0))
	b.add_theme_font_override("font", load(BOLD))
	b.custom_minimum_size.y = HudTheme.px(BUTTON)
	HudTheme.make_primary(b)
	return b

## A short warning line: why an action is blocked.
static func warning(text: String) -> PanelContainer:
	var c := PanelContainer.new()
	var box := HudTheme.flat(Color(HudTheme.LACKING, 0.12), 6.0, Color(HudTheme.LACKING, 0.6), 1.0)
	c.add_theme_stylebox_override("panel", box)
	c.add_child(label(text, BODY, HudTheme.LACKING, false, true))
	return c

## The building as it is painted in the camp, framed: a square cut of the painting around its traced outline.
static func portrait(id: String, size := 64.0) -> PanelContainer:
	var frame := PanelContainer.new()
	var box := HudTheme.flat(Color(0, 0, 0, 0.4), 10.0, HudTheme.BRASS, 1.5)
	box.set_content_margin_all(HudTheme.px(2))
	frame.add_theme_stylebox_override("panel", box)
	var pic := TextureRect.new()
	pic.texture = portrait_texture(id)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	pic.custom_minimum_size = Vector2.ONE * HudTheme.px(size)
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_child(pic)
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return frame

## The square region of the painting around building `id`'s outline (CampLayout is in world units, half the painting's px).
static func portrait_region(id: String) -> Rect2:
	var outline := CampLayout.outline(id)
	var low := outline[0]
	var high := outline[0]
	for p in outline:
		low = low.min(p)
		high = high.max(p)
	# The outline's centre, (low + high) / 2 world units, is low + high painting px.
	var centre := low + high
	var side := maxf(high.x - low.x, high.y - low.y) * 2.0 + PORTRAIT_PAD * 2.0
	return Rect2(centre - Vector2.ONE * side * 0.5, Vector2.ONE * side)

static func portrait_texture(id: String) -> Texture2D:
	if not _portraits.has(id):
		var atlas := AtlasTexture.new()
		atlas.atlas = load(CampLayout.PAINTING)
		atlas.region = portrait_region(id).intersection(Rect2(Vector2.ZERO, CampModels.SIZE))
		_portraits[id] = atlas
	return _portraits[id]
