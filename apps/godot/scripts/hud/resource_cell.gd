class_name ResourceCell
extends PanelContainer
## One resource in the top bar: a dark pill with the resource's icon, the amount in bold, a thin bar showing how full its store is,
## and the `+rate/h` under it. The bar is brass while it fills, amber near the cap and gold when full; a full store also turns the
## amount gold and says "Full" in place of the rate.

const NEAR := Color("e09a3a")
## The store bar's height, in mockup px.
const BAR := 2.0

var _icon: HudIcon
var _amount := Label.new()
var _rate := Label.new()
var _fraction := 0.0
var _bar_colour := HudTheme.BRASS

func _init(resource_id := "food") -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var box := HudTheme.slice("frame_cell", 28.0, 3.0, 0.0)
	# Tight sides: the widest amount (the top storage cap, 42,000) and rate must fit four pills across a 375 px phone.
	box.content_margin_left = HudTheme.px(3)
	box.content_margin_right = HudTheme.px(3)
	box.content_margin_top = 0.0
	# The bar sits in the rate line's descender space at the bottom edge, so the pill is no taller than the plain cell was.
	box.content_margin_bottom = 0.0
	add_theme_stylebox_override("panel", box)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(3)))
	_icon = HudIcon.new(resource_id, 23.0)
	_icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_icon)
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", 0)
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	_amount.add_theme_font_override("font", load(UiKit.BOLD))
	_amount.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_BODY))
	_rate.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_SMALL - 1.0))
	_rate.add_theme_color_override("font_color", HudTheme.TEXT_SECOND)
	for label in [_amount, _rate]:
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		label.clip_text = true
		label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	column.add_child(_amount)
	column.add_child(_rate)
	row.add_child(column)
	add_child(row)

## `state` is "normal", "near" or "full" (HudModel.chips); `fraction` is how full the store is (0 to 1).
func set_values(amount_text: String, rate_text: String, state: String, fraction := 0.0) -> void:
	var full := state == "full"
	_amount.text = amount_text
	_rate.text = Loc.t("hud.full") if full else rate_text
	var colour := HudTheme.GOLD if full else HudTheme.TEXT
	_amount.add_theme_color_override("font_color", colour)
	_rate.add_theme_color_override("font_color", HudTheme.GOLD if full else HudTheme.TEXT_SECOND)
	var colour_now: Color = HudTheme.GOLD if full else (NEAR if state == "near" else HudTheme.BRASS)
	fraction = clampf(fraction, 0.0, 1.0)
	if not is_equal_approx(fraction, _fraction) or colour_now != _bar_colour:
		_fraction = fraction
		_bar_colour = colour_now
		queue_redraw()

func amount_text() -> String:
	return _amount.text

func rate_text() -> String:
	return _rate.text

func is_full() -> bool:
	return _amount.get_theme_color("font_color") == HudTheme.GOLD

## The store bar's fill (0 to 100) and colour, for tests.
func bar_value() -> float:
	return _fraction * 100.0

func bar_colour() -> Color:
	return _bar_colour

## The store bar along the pill's bottom edge, inside its rounded ends (drawn, so it adds no height to the top bar, under which
## the camp is fitted). It fills from the reading start.
func _draw() -> void:
	var inset := HudTheme.px(7)
	var h := HudTheme.px(BAR)
	var y := size.y - h - HudTheme.px(1)
	var full_width := size.x - inset * 2.0
	draw_rect(Rect2(inset, y, full_width, h), Color(HudTheme.TEXT, 0.18))
	var width := full_width * _fraction
	var x := inset if not is_layout_rtl() else size.x - inset - width
	if width > 0.0:
		draw_rect(Rect2(x, y, width, h), _bar_colour)
