class_name ResourceCell
extends Control
## One resource in the top bar: a tray that fills with the resource's own colour as its store does, the big icon standing out of its
## start, the amount in bold and the `+rate/h` under it. Near the cap the fill turns amber; a full store turns gold and says "Full" in
## place of the rate. Everything is laid out by hand, so no text changes the bar's height.

const COLOURS := {
	"food": Color("7f8c2e"),
	"materiel": Color("5a7380"),
	"funds": Color("a5752a"),
	"support": Color("a8503a"),
}
const NEAR := Color("c9772a")
const FULL := Color("c9922c")
## Mockup px.
const HEIGHT := 44.0
const ICON := 32.5
## How far the tray starts inside the cell, so the icon stands out of it.
const INSET := 7.0
const AMOUNT_FONTS: Array[float] = [15.0, 14.0, 13.0, 12.0]
const RATE_FONTS: Array[float] = [12.0, 11.0, 10.0]

var _gauge := Gauge.new()
var _icon: HudIcon
var _amount := _text(AMOUNT_FONTS[0], HudTheme.BUTTON_TEXT)
var _rate := _text(RATE_FONTS[0], HudTheme.TEXT)
var _state := "normal"
var _colour := Color.WHITE

func _init(resource_id := "food") -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	custom_minimum_size.y = HudTheme.px(HEIGHT)
	_colour = COLOURS.get(resource_id, HudTheme.BRASS)
	_gauge.layout_direction = Control.LAYOUT_DIRECTION_INHERITED
	add_child(_gauge)
	add_child(_amount)
	add_child(_rate)
	_icon = HudIcon.new(resource_id, ICON)
	add_child(_icon)
	resized.connect(_layout)

func _notification(what: int) -> void:
	if what == NOTIFICATION_LAYOUT_DIRECTION_CHANGED and _icon != null:
		# After the children have turned too: a child laid out before that is mirrored once more.
		_layout.call_deferred()

static func _text(font_size: float, colour: Color) -> Label:
	var label := UiKit.label("", font_size, colour, true)
	label.add_theme_color_override("font_outline_color", HudTheme.BUTTON_INK)
	label.add_theme_constant_override("outline_size", roundi(HudTheme.px(2.6)))
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.clip_text = true
	return label

func _layout() -> void:
	var rtl := is_layout_rtl()
	var inset := HudTheme.px(INSET)
	var icon := HudTheme.px(ICON)
	_gauge.position = Vector2(0.0 if rtl else inset, 0.0)
	_gauge.size = Vector2(size.x - inset, size.y)
	_icon.size = Vector2.ONE * icon
	_icon.position = Vector2(size.x - icon if rtl else 0.0, (size.y - HudTheme.px(2.0) - icon) * 0.5)
	# The words have the room between the icon and the tray's far rim.
	var start := icon + HudTheme.px(1.0)
	var room := size.x - start - Gauge.RIM - HudTheme.px(1.0)
	var x := size.x - start - room if rtl else start
	var top := HudTheme.px(3.0)
	var amount_h := HudTheme.px(20.0)
	_amount.position = Vector2(x, top)
	_amount.size = Vector2(room, amount_h)
	_rate.position = Vector2(x, top + amount_h - HudTheme.px(2.0))
	_rate.size = Vector2(room, HudTheme.px(17.0))
	_fit(_amount, AMOUNT_FONTS)
	_fit(_rate, RATE_FONTS)

## The biggest of `sizes` at which the label's text fits its room.
func _fit(label: Label, sizes: Array[float]) -> void:
	var font := label.get_theme_font("font")
	for size_px in sizes:
		var px := HudTheme.font(size_px)
		if size_px == sizes[-1] or font.get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x <= label.size.x:
			if label.get_theme_font_size("font_size") != px:
				label.add_theme_font_size_override("font_size", px)
			return

## `state` is "normal", "near" or "full" (HudModel.chips); `fraction` is how full the store is (0 to 1).
func set_values(amount_text: String, rate_text: String, state: String, fraction := 0.0) -> void:
	_gauge.set_fill(fraction, bar_colour_for(state))
	var rate := Loc.t("hud.full") if state == "full" else rate_text
	if amount_text == _amount.text and rate == _rate.text and state == _state:
		return
	_state = state
	_amount.text = amount_text
	_rate.text = rate
	_rate.add_theme_color_override("font_color", HudTheme.BUTTON_TEXT if state == "full" else HudTheme.TEXT)
	_fit(_amount, AMOUNT_FONTS)
	_fit(_rate, RATE_FONTS)

func bar_colour_for(state: String) -> Color:
	return FULL if state == "full" else (NEAR if state == "near" else _colour)

func amount_text() -> String:
	return _amount.text

func rate_text() -> String:
	return _rate.text

func is_full() -> bool:
	return _state == "full"

## The store's fill (0 to 100) and colour, for tests.
func bar_value() -> float:
	return _gauge.fraction * 100.0

func bar_colour() -> Color:
	return _gauge.colour
