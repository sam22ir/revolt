class_name HudTheme
extends RefCounted
## The campaign-chest look (docs/design/design-system.md): walnut, stitched leather and parchment in engraved brass frames, drawn in the
## icons' style (art/kit/, made by tools/ui/). Every surface of the game comes from here as a FrameBox or a small nine-slice. Lengths
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

## The full-width band: the header at the top and the nav band at the bottom, walnut in an engraved rail.
static func band(margin_x := 9.0, margin_y := 8.0) -> FrameBox:
	return framed("frame_band", 60.0, "wood_h", margin_x, margin_y)

## A round button's face: the brass ring and the leather in it.
static func round_face(big := false) -> StyleBoxTexture:
	return slice("round_big" if big else "round", 0.0, 0.0, 0.0)

## The big cards and the pages' panel: walnut in a rope-edged frame with scrollwork corners.
static func sheet(margin_x := 15.0, margin_y := 15.0) -> FrameBox:
	return framed("frame_sheet", 138.0, "wood_h", margin_x, margin_y)

## A section: a stitched leather patch.
static func card(margin_x := 13.0, margin_y := 12.0) -> FrameBox:
	return framed("frame_card", 48.0, "leather", margin_x, margin_y)

## The shared small plaque: leather in a thin brass rim; `gold` marks one that invites a tap.
static func panel(margin_x := 10.0, margin_y := 6.0, gold := false) -> FrameBox:
	return framed("frame_plate_gold" if gold else "frame_plate", 26.0, "leather", margin_x, margin_y, Color(0.82, 0.8, 0.78))

## A light paper panel with ink text: the map's tile panel.
static func parchment(margin_x := 12.0, margin_y := 10.0) -> FrameBox:
	return framed("frame_button", 30.0, "parchment", margin_x, margin_y)

## A recess for a text field.
static func inset(margin_x := 8.0, margin_y := 4.0) -> FrameBox:
	return framed("frame_inset", 22.0, "leather", margin_x, margin_y, Color(0.45, 0.42, 0.4))

static func pill(margin_x := 8.0, margin_y := 4.0) -> StyleBoxTexture:
	return slice("pill", 38.0, margin_x, margin_y)

## A segment or a toggle: olive enamel when on.
static func segment(on: bool) -> StyleBoxTexture:
	return slice("segment_on" if on else "segment", 26.0, 10.0, 6.0)

## The plate of a name over the painting, in viewport px.
static func tag(margin_x: float, margin_y: float) -> FrameBox:
	var box := FrameBox.new()
	box.frame = load(KIT + "tag.svg")
	box.edge = 18.0
	box.draw_centre = true
	_margins(box, margin_x / SCALE, margin_y / SCALE)
	return box

## The screen's one main action (upgrade, train): hammered gold with dark text, so it stands out from the bronze buttons.
static func make_primary(button: Button) -> void:
	for state in ["normal", "hover", "focus", "pressed", "disabled"]:
		var tint: Color = {"hover": Color(1.06, 1.06, 1.06), "pressed": Color(0.82, 0.8, 0.76), "disabled": Color(0.4, 0.37, 0.33)}.get(state, Color.WHITE)
		var box := framed("frame_gold", 44.0, "gold", 12.0, 6.0, tint)
		box.frame_tint = Color(0.62, 0.6, 0.57) if state == "disabled" else Color.WHITE
		button.add_theme_stylebox_override(state, box)
	for colour_name in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(colour_name, ON_GOLD)
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
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		for type in ["Button", "OptionButton"]:
			theme.set_stylebox(state, type, button_box(state))
	for colour_name in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		theme.set_color(colour_name, "Button", TEXT)
	theme.set_color("font_disabled_color", "Button", TEXT_SECOND)
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

## The bronze button over dark leather, for a state of Button.
static func button_box(state: String) -> FrameBox:
	var box := framed("frame_button", 30.0, "leather", 10.0, 6.0, Color(1.25, 1.2, 1.15))
	if state == "pressed":
		box.fill_tint = Color(1.7, 1.5, 1.25)
		box.frame_tint = Color(1.15, 1.1, 1.0)
	elif state == "disabled":
		box.fill_tint = Color(0.6, 0.6, 0.6)
		box.frame_tint = Color(0.6, 0.58, 0.55)
	return box

static func progress_track() -> FrameBox:
	return framed("frame_inset", 22.0, "leather", 0.0, 0.0, Color(0.4, 0.38, 0.36))

static func progress_fill() -> StyleBoxTexture:
	var box := slice("progress_fill", 6.0, 0.0, 0.0)
	box.axis_stretch_horizontal = StyleBoxTexture.AXIS_STRETCH_MODE_TILE
	return box
