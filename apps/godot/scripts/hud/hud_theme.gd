class_name HudTheme
extends RefCounted
## The bronze HUD (docs/godot-visuals-plan.md): painted bronze frames (art/hud/) for the header, the nav band, the round buttons and
## the theme's buttons, and flat gunmetal panels with one bronze hairline for the small pieces inside them. Lengths are written in
## mockup px (a 375 px wide phone) and scaled to the 1080 px viewport by `px`. One Theme carries the panels and buttons; the round
## buttons, the cells and the switch take their colours from the constants here, so a palette change touches this file only.

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

const ART := "res://art/hud/"

## A mockup length in viewport px.
static func px(value: float) -> float:
	return value * SCALE

static func font(value: float) -> int:
	return roundi(value * SCALE)

## A painted bronze piece as a nine-slice: `edge` source px at each side stay unstretched, content sits `margin_x` and `margin_y`
## mockup px in from the outside.
static func frame(piece: String, edge: float, margin_x: float, margin_y: float) -> StyleBoxTexture:
	var box := StyleBoxTexture.new()
	box.texture = load(ART + piece + ".png")
	box.set_texture_margin_all(edge)
	box.content_margin_left = px(margin_x)
	box.content_margin_right = px(margin_x)
	box.content_margin_top = px(margin_y)
	box.content_margin_bottom = px(margin_y)
	return box

## The full-width band: the header at the top and the nav band at the bottom.
static func band(margin_x := 9.0, margin_y := 8.0) -> StyleBoxTexture:
	return frame("bronze_bar", 24.0, margin_x, margin_y)

## A round button's face, keeping the painted ring whole.
static func round_face(big := false) -> StyleBoxTexture:
	return frame("bronze_round_big" if big else "bronze_round", 0.0, 0.0, 0.0)

## The building sheet: the painted bronze panel, its corners unstretched.
static func sheet() -> StyleBoxTexture:
	return frame("bronze_panel", 48.0, 13.0, 13.0)

## The screen's one main action (upgrade, train): gold with dark text, so it stands out from the bronze buttons.
static func make_primary(button: Button) -> void:
	button.add_theme_stylebox_override("normal", flat(GOLD, 6.0))
	button.add_theme_stylebox_override("hover", flat(GOLD.lightened(0.15), 6.0))
	button.add_theme_stylebox_override("focus", flat(GOLD, 6.0))
	button.add_theme_stylebox_override("pressed", flat(GOLD.darkened(0.15), 6.0))
	button.add_theme_stylebox_override("disabled", flat(DISABLED, 6.0))
	for colour_name in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(colour_name, ON_GOLD)
	button.add_theme_color_override("font_disabled_color", TEXT_SECOND)

## The shared dark panel: translucent gunmetal, bronze hairline, rounded corners, a soft shadow.
static func panel(radius := RADIUS, margin_x := 10.0, margin_y := 6.0) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = PANEL
	box.border_color = BRASS
	box.set_border_width_all(maxi(1, roundi(px(BORDER))))
	box.set_corner_radius_all(roundi(px(radius)))
	box.shadow_color = SHADOW
	box.shadow_size = roundi(px(4))
	box.content_margin_left = px(margin_x)
	box.content_margin_right = px(margin_x)
	box.content_margin_top = px(margin_y)
	box.content_margin_bottom = px(margin_y)
	return box

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

## The Theme for the HUD root: labels in sand, panels as above, and buttons on the painted bronze button.
static func build() -> Theme:
	var theme := Theme.new()
	theme.set_color("font_color", "Label", TEXT)
	theme.set_font_size("font_size", "Label", font(FONT_BODY))
	theme.set_stylebox("panel", "PanelContainer", panel())
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		var box := frame("bronze_button", 22.0, 10.0, 6.0)
		if state == "pressed":
			box.modulate_color = Color(1.25, 1.2, 1.1)
		elif state == "disabled":
			box.modulate_color = Color(0.65, 0.65, 0.65)
		theme.set_stylebox(state, "Button", box)
	for colour_name in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		theme.set_color(colour_name, "Button", TEXT)
	theme.set_color("font_disabled_color", "Button", TEXT_SECOND)
	theme.set_font_size("font_size", "Button", font(FONT_BODY))
	return theme
