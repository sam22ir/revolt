class_name HudTheme
extends RefCounted
## The HUD drawn in code (docs/godot-visuals-plan.md, look test): flat dark-earth panels with one thin brass border, no painted
## frames. Every value is the approved mockup's, written in mockup px (a 375 px wide phone) and scaled to the 1080 px viewport by
## `px`, so the mockup and the game compare one to one. One Theme carries the panels and buttons; the round buttons, the cells and
## the switch take their colours from the constants here, so a palette change touches this file only.

## Viewport px per mockup px (the viewport is 1080 wide, the mockup 375).
const SCALE := 1080.0 / 375.0

const PANEL := Color(38.0 / 255.0, 29.0 / 255.0, 22.0 / 255.0, 0.9)
const BRASS := Color("b08d57")
const TEXT := Color("e8d5b0")
const TEXT_SECOND := Color("bfa77c")
const TERRACOTTA := Color("b5532f")
const RING := Color("e2c07a")
const ALERT := Color("d9462b")
const GOLD := Color("f0c060")
const OLIVE := Color("6b7a3a")
const SHADOW := Color(0, 0, 0, 0.35)

const RADIUS := 10.0
const BORDER := 1.0
const ROUND_BUTTON := 44.0
const SWITCH := 66.0
const FONT_BODY := 13.0
const FONT_SMALL := 11.0
const FONT_BIG := 15.0

## A mockup length in viewport px.
static func px(value: float) -> float:
	return value * SCALE

static func font(value: float) -> int:
	return roundi(value * SCALE)

## The shared dark panel: translucent earth, brass hairline, rounded corners, a soft shadow.
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

## The Theme for the HUD root: labels in sand, panels as above, and buttons as flat earth boxes with a brass hairline.
static func build() -> Theme:
	var theme := Theme.new()
	theme.set_color("font_color", "Label", TEXT)
	theme.set_font_size("font_size", "Label", font(FONT_BODY))
	theme.set_stylebox("panel", "PanelContainer", panel())
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		var fill := PANEL
		if state == "pressed":
			fill = Color(PANEL, 1.0).lightened(0.12)
		var box := flat(fill, RADIUS, BRASS, BORDER)
		if state == "disabled":
			box.border_color = Color(BRASS, 0.4)
		theme.set_stylebox(state, "Button", box)
	for colour_name in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		theme.set_color(colour_name, "Button", TEXT)
	theme.set_color("font_disabled_color", "Button", TEXT_SECOND)
	theme.set_font_size("font_size", "Button", font(FONT_BODY))
	return theme
