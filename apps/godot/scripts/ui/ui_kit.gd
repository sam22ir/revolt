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
## The painted icon set (art/hud/icons/, cut from art/hud/source/icons-1.jpg): round bronze medallions.
const ICONS := "res://art/hud/icons/"
const TROOPS := "res://art/troops/"
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

## A stitched leather section. Add rows to the returned card's first child (a VBoxContainer).
static func card(title := "") -> PanelContainer:
	var c := PanelContainer.new()
	var box := HudTheme.card()
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
	var icon := HudIcon.new(resource_id, 24.0)
	return _chip(icon, label(amount, BODY, HudTheme.LACKING if lacking else HudTheme.TEXT, true))

## Changes a cost or time chip in place (for chips that follow a count every frame).
static func set_chip(chip: PanelContainer, text: String, lacking := false) -> void:
	var value := chip.get_child(0).get_child(1) as Label
	value.text = text
	value.add_theme_color_override("font_color", HudTheme.LACKING if lacking else HudTheme.TEXT)

## A duration as a clock and the time.
static func time_chip(text: String) -> PanelContainer:
	return _chip(painted("clock", 22.0), label(text, BODY, HudTheme.TEXT, true))

## One painted medallion of `size` mockup px: clock, lock, sword, shield, troops, wounded, storage, builders, level_up.
static func painted(icon_name: String, size := 22.0) -> TextureRect:
	var t := TextureRect.new()
	t.texture = load(ICONS + icon_name + ".png")
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = Vector2.ONE * HudTheme.px(size)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t

## A troop's painted medallion (art/troops/, copied from the Phaser client by `pnpm godot:export`).
static func troop_medallion(troop: String, size := 44.0) -> TextureRect:
	var t := painted("troops", size)
	t.texture = troop_texture(troop)
	t.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	return t

static func troop_texture(troop: String) -> Texture2D:
	return load(TROOPS + "troop_%s.webp" % troop)

## A small icon (HudIcon) and a text in a dark pill, such as "At home 10".
static func stat_chip(icon_name: String, text: String) -> PanelContainer:
	return _chip(HudIcon.new(icon_name, 22.0), label(text, SMALL, HudTheme.TEXT, true))

static func _chip(icon: Control, value: Label) -> PanelContainer:
	var chip := PanelContainer.new()
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
	var box := HudTheme.flat(Color(HudTheme.LACKING, 0.12), 6.0, Color(HudTheme.LACKING, 0.6), 1.0)
	c.add_theme_stylebox_override("panel", box)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	var lock := painted("lock", 22.0)
	lock.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(lock)
	var text_label := label(text, BODY, HudTheme.LACKING, false, true)
	text_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(text_label)
	c.add_child(row)
	return c

static func set_warning(warning_line: PanelContainer, text: String) -> void:
	(warning_line.get_child(0).get_child(1) as Label).text = text

## The building as it is painted in the camp, framed: a square cut of the painting around its traced outline.
static func portrait(id: String, size := 64.0) -> PanelContainer:
	var frame := PanelContainer.new()
	var box := StyleBoxEmpty.new()
	frame.add_theme_stylebox_override("panel", box)
	var pic := TextureRect.new()
	pic.texture = portrait_texture(id)
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
