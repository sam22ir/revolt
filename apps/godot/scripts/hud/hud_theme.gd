class_name HudTheme
extends RefCounted
## The camp look (docs/design/design-system.md): plain calm surfaces in rounded borders with a lip, like the chunky
## game buttons they carry, all drawn by tools/ui/ into art/kit/. Every surface comes from here as a FrameBox or a small nine-slice. Lengths
## are written in mockup px (a 375 px wide phone) and scaled to the 1080 px viewport by `px`.

## Viewport px per mockup px (the viewport is 1080 wide, the mockup 375).
const SCALE := 1080.0 / 375.0

const PANEL := Color(40.0 / 255.0, 39.0 / 255.0, 35.0 / 255.0, 0.92)
const BRASS := Color("a8834f")
const TEXT := Color("e8d5b0")
const TEXT_SECOND := Color("bfa77c")
const TERRACOTTA := Color("b5532f")
const RING := Color("e2c07a")
const ALERT := Color("d9462b")
const GOLD := Color("f0c060")
const OLIVE := Color("6b7a3a")
## Text on the gold button, and a lacking cost on the dark sheet (ALERT is too dim there).
const ON_GOLD := Color("2b2a24")
const LACKING := Color("f0795c")
const DISABLED := Color("4a4538")
const SHADOW := Color(0, 0, 0, 0.35)

const RADIUS := 10.0
const BORDER := 1.0
const ROUND_BUTTON := 44.0
const SWITCH := 66.0
const FONT_BODY := 13.0
const FONT_SMALL := 11.0
const FONT_BIG := 15.0

const KIT := "res://art/kit/"
## The pole frame's corner, in its own px.
const SHEET_EDGE := 72.0
## The kinds of button: green goes, wood is neutral, blue is a tool, red leaves or stops, amber is the chosen one, grey is off;
## lit is the open page's tab.
const BUTTON_KINDS: Array[String] = ["green", "lit", "wood", "blue", "red", "amber", "grey"]
## How far a pressed button's face sinks, in viewport px (tools/ui/build_frames.py `button`).
const PRESS := 9.0
## The lip under a button's face, which its text must stay clear of.
const LIP := 14.0
const BUTTON_TEXT := Color("fff3d6")
const BUTTON_INK := Color("1a1109")

## A mockup length in viewport px.
static func px(value: float) -> float:
	return value * SCALE

static func font(value: float) -> int:
	return roundi(value * SCALE)

## A framed surface: `frame` and its corner `edge` in px, over the tiled material `fill` ("" for none). Margins are mockup px.
static func framed(frame: String, edge: float, fill: String, margin_x: float, margin_y: float, fill_tint := Color.WHITE) -> FrameBox:
	var box := FrameBox.new()
	box.frame = load(KIT + frame + ".svg")
	box.edge = edge
	if fill != "":
		box.fill = load(KIT + "fill_" + fill + ".webp")
	box.fill_tint = fill_tint
	_margins(box, margin_x, margin_y)
	return box

static func _margins(box: StyleBox, margin_x: float, margin_y: float) -> void:
	box.content_margin_left = px(margin_x)
	box.content_margin_right = px(margin_x)
	box.content_margin_top = px(margin_y)
	box.content_margin_bottom = px(margin_y)

## A small piece that carries its own fill, as a stretched nine-slice (rounded pills, cells and segments: no texture to smear).
static func slice(piece: String, edge: float, margin_x: float, margin_y: float) -> StyleBoxTexture:
	var box := StyleBoxTexture.new()
	box.texture = load(KIT + piece + ".svg")
	box.set_texture_margin_all(edge)
	_margins(box, margin_x, margin_y)
	return box

## The full-width band: the header at the top and the nav band at the bottom, a plain board in a wooden rim.
static func band(margin_x := 9.0, margin_y := 8.0) -> FrameBox:
	return framed("frame_band", 40.0, "board", margin_x, margin_y)

## A round button's face ("round", "round_big" or "round_red"), up or pressed.
static func round_face(piece := "round", down := false) -> StyleBoxTexture:
	return slice(piece + ("_down" if down else ""), 0.0, 0.0, 0.0)

## Puts a round face on a button in all its states.
static func make_round(button: Button, piece := "round") -> void:
	for state in ["normal", "hover", "disabled"]:
		button.add_theme_stylebox_override(state, round_face(piece))
	for state in ["pressed", "hover_pressed"]:
		button.add_theme_stylebox_override(state, round_face(piece, true))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())

## The big cards and the pages' panel: a plain board in four rough poles lashed with rope.
static func sheet(margin_x := 15.0, margin_y := 15.0) -> FrameBox:
	return framed("frame_sheet", SHEET_EDGE, "board", margin_x, margin_y)

## A section: plain cloth.
static func card(margin_x := 13.0, margin_y := 12.0) -> FrameBox:
	var box := framed("frame_card", 48.0, "cloth", margin_x, margin_y)
	# Its corners are rounder.
	box.inset = 8.0
	return box

## The shared small plaque: cloth in a rounded rim; `warm` (an amber rim) marks one that invites a tap.
static func panel(margin_x := 10.0, margin_y := 6.0, warm := false) -> FrameBox:
	return framed("frame_plate_warm" if warm else "frame_plate", 26.0, "cloth", margin_x, margin_y, Color(0.82, 0.8, 0.78))

## A recess for a text field.
static func inset(margin_x := 8.0, margin_y := 4.0) -> FrameBox:
	return framed("frame_inset", 22.0, "cloth", margin_x, margin_y, Color(0.45, 0.42, 0.4))

static func pill(margin_x := 8.0, margin_y := 4.0) -> StyleBoxTexture:
	return slice("pill", 38.0, margin_x, margin_y)

## The plate of a name over the painting, in viewport px.
static func tag(margin_x: float, margin_y: float) -> FrameBox:
	var box := FrameBox.new()
	box.frame = load(KIT + "tag.svg")
	box.edge = 20.0
	box.draw_centre = true
	_margins(box, margin_x / SCALE, margin_y / SCALE)
	return box

## A button's box: `kind` of BUTTON_KINDS, up or down. `compact` is for a button that must not grow its row.
static func button_box(kind: String, down := false, compact := false) -> StyleBoxTexture:
	var key := "%s|%s|%s" % [kind, down, compact]
	if not _buttons.has(key):
		var box := StyleBoxTexture.new()
		box.texture = load(KIT + "btn_%s%s.svg" % [kind, "_down" if down else ""])
		box.set_texture_margin(SIDE_LEFT, 32.0)
		box.set_texture_margin(SIDE_RIGHT, 32.0)
		box.set_texture_margin(SIDE_TOP, 32.0)
		box.set_texture_margin(SIDE_BOTTOM, 38.0)
		box.content_margin_left = px(6.0 if compact else 11.0)
		box.content_margin_right = box.content_margin_left
		# The text rides on the face: above the lip, and lower while it is pressed. Both add up to the same height.
		var pad := 0.0 if compact else px(4.0)
		box.content_margin_top = pad + 4.0 + (PRESS if down else 0.0)
		box.content_margin_bottom = pad + LIP - (PRESS if down else 0.0)
		_buttons[key] = box
	return _buttons[key]

static var _buttons := {}

## Dresses a button as `kind`. `chosen` is the kind of a toggle button that is on.
static func dress(button: Button, kind: String, chosen := "", compact := false) -> void:
	# A thumb's height, unless it must not grow its row.
	if not compact:
		button.custom_minimum_size.y = maxf(button.custom_minimum_size.y, px(UiKit.TAP))
	if button.get_theme_font_size("font_size") < font(FONT_BODY) and not compact:
		button.add_theme_font_size_override("font_size", font(FONT_BODY))
	# Hover looks like normal: a finger leaves it "hovered". Focus is drawn over the state, so it stays empty.
	for state in ["normal", "hover"]:
		button.add_theme_stylebox_override(state, button_box(kind, false, compact))
	for state in ["pressed", "hover_pressed"]:
		button.add_theme_stylebox_override(state, button_box(chosen if chosen != "" else kind, chosen == "", compact))
	button.add_theme_stylebox_override("disabled", button_box("grey", false, compact))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())

## The screen's one main action (upgrade, train).
static func make_primary(button: Button) -> void:
	dress(button, "green")
	button.add_theme_color_override("font_disabled_color", TEXT)

## A circle of `diameter` mockup px: the round buttons (earth fill) and the switch (terracotta fill, brass ring).
static func round_style(fill: Color, ring: Color, diameter: float, ring_width := BORDER) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = ring
	box.set_border_width_all(maxi(1, roundi(px(ring_width))))
	box.set_corner_radius_all(roundi(px(diameter) * 0.5))
	box.shadow_color = SHADOW
	box.shadow_size = roundi(px(3))
	return box

## A flat filled box with no border, for toggles and segments.
static func flat(fill: Color, radius := 8.0, border := Color(0, 0, 0, 0), border_width := 0.0) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = border
	box.set_border_width_all(roundi(px(border_width)))
	box.set_corner_radius_all(roundi(px(radius)))
	box.content_margin_left = px(10)
	box.content_margin_right = px(10)
	box.content_margin_top = px(6)
	box.content_margin_bottom = px(6)
	return box

## The Theme for the HUD root: labels in sand, and every stock control on the kit's pieces.
static func build() -> Theme:
	var theme := Theme.new()
	theme.set_color("font_color", "Label", TEXT)
	theme.set_font_size("font_size", "Label", font(FONT_BODY))
	theme.set_stylebox("panel", "PanelContainer", panel())
	for state in ["normal", "hover"]:
		theme.set_stylebox(state, "Button", button_box("wood"))
	for state in ["pressed", "hover_pressed"]:
		theme.set_stylebox(state, "Button", button_box("wood", true))
	theme.set_stylebox("disabled", "Button", button_box("grey"))
	theme.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	theme.set_font("font", "Button", load(UiKit.BOLD))
	theme.set_color("font_outline_color", "Button", BUTTON_INK)
	theme.set_constant("outline_size", "Button", roundi(px(2.4)))
	for colour_name in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		theme.set_color(colour_name, "Button", BUTTON_TEXT)
	theme.set_color("font_disabled_color", "Button", Color("c9bda3"))
	theme.set_font_size("font_size", "Button", font(FONT_BODY))
	var focus := inset()
	focus.frame_tint = Color(1.35, 1.25, 1.0)
	theme.set_stylebox("normal", "LineEdit", inset())
	theme.set_stylebox("focus", "LineEdit", focus)
	theme.set_stylebox("read_only", "LineEdit", inset())
	theme.set_color("font_color", "LineEdit", TEXT)
	theme.set_color("font_placeholder_color", "LineEdit", TEXT_SECOND)
	theme.set_stylebox("panel", "PopupMenu", panel())
	theme.set_stylebox("hover", "PopupMenu", flat(Color(GOLD, 0.22), 4.0))
	theme.set_color("font_color", "PopupMenu", TEXT)
	theme.set_stylebox("background", "ProgressBar", progress_track())
	theme.set_stylebox("fill", "ProgressBar", progress_fill())
	for type in ["VScrollBar", "HScrollBar"]:
		theme.set_stylebox("scroll", type, _bar(Color(0, 0, 0, 0.3)))
		for grabber in ["grabber", "grabber_highlight", "grabber_pressed"]:
			theme.set_stylebox(grabber, type, _bar(Color(BRASS, 0.75)))
	return theme

static func _bar(colour: Color) -> StyleBoxFlat:
	var box := flat(colour, 2.0)
	_margins(box, 1.5, 1.5)
	return box

static func progress_track() -> FrameBox:
	return framed("frame_inset", 22.0, "cloth", 0.0, 0.0, Color(0.4, 0.38, 0.36))

static func progress_fill() -> StyleBoxTexture:
	var box := slice("progress_fill", 6.0, 0.0, 0.0)
	box.axis_stretch_horizontal = StyleBoxTexture.AXIS_STRETCH_MODE_TILE
	return box
