class_name ResourceCell
extends Control
## One resource in the top bar: a slim dark pill with the icon at its start, the amount in bold, and a thin line under the amount
## that fills with the resource's own colour as its store does. Near the cap the line turns amber; a full store turns the line and
## the amount gold. The hourly rate is not shown here: the resource sheet a tap opens has it. Everything is laid out by hand, so no
## text changes the bar's height. A tap announces `pressed`; `pulse` bounces it when something lands in it.

signal pressed

const COLOURS := {
	"food": Color("9aab3a"),
	"materiel": Color("7c9aa8"),
	"funds": Color("d39a3a"),
	"support": Color("c8664a"),
}
const NEAR := Color("e08a30")
const FULL := Color("f0c060")
const TRACK := Color(1.0, 1.0, 1.0, 0.14)
const FACE := Color(0.06, 0.035, 0.016, 0.72)
## Mockup px.
const HEIGHT := 30.0
const ICON := 28.0
const LINE := 3.0
## Room kept at the far end of the pill, and under the line.
const PAD := 7.0
const FOOT := 4.0
const AMOUNT_FONTS: Array[float] = [16.0, 15.0, 14.0, 13.0, 12.0]

var _face := Panel.new()
var _track := Panel.new()
var _clip := Control.new()
var _fill := Panel.new()
var _fill_box := StyleBoxFlat.new()
var _icon: HudIcon
var _amount := _text(AMOUNT_FONTS[0])
var _state := "normal"
var _colour := Color.WHITE
var _fraction := 0.0
var _bar_colour := Color.WHITE

var resource_id := ""
var _pulse: Tween

func _init(resource_id_value := "food") -> void:
	resource_id = resource_id_value
	mouse_filter = Control.MOUSE_FILTER_STOP
	gui_input.connect(_on_gui_input)
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	custom_minimum_size.y = HudTheme.px(HEIGHT)
	_colour = COLOURS.get(resource_id, HudTheme.BRASS)
	_bar_colour = _colour
	var face := StyleBoxFlat.new()
	face.bg_color = FACE
	face.border_color = Color(HudTheme.BRASS, 0.6)
	face.set_border_width_all(maxi(1, roundi(HudTheme.px(1.0))))
	face.set_corner_radius_all(roundi(HudTheme.px(HEIGHT * 0.5)))
	_face.add_theme_stylebox_override("panel", face)
	var track := StyleBoxFlat.new()
	track.bg_color = TRACK
	track.set_corner_radius_all(roundi(HudTheme.px(LINE * 0.5)))
	_track.add_theme_stylebox_override("panel", track)
	_fill_box.bg_color = _colour
	_fill_box.set_corner_radius_all(roundi(HudTheme.px(LINE * 0.5)))
	_fill.add_theme_stylebox_override("panel", _fill_box)
	_clip.clip_contents = true
	_clip.add_child(_fill)
	for part: Control in [_face, _track, _clip, _fill]:
		part.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_face)
	add_child(_track)
	add_child(_clip)
	add_child(_amount)
	_icon = HudIcon.new(resource_id, ICON)
	add_child(_icon)
	resized.connect(_layout)

func _notification(what: int) -> void:
	if what == NOTIFICATION_LAYOUT_DIRECTION_CHANGED and _icon != null:
		# After the children have turned too: a child laid out before that is mirrored once more.
		_layout.call_deferred()

static func _text(font_size: float) -> Label:
	var label := UiKit.label("", font_size, HudTheme.BUTTON_TEXT, true)
	label.add_theme_color_override("font_outline_color", HudTheme.BUTTON_INK)
	label.add_theme_constant_override("outline_size", roundi(HudTheme.px(2.6)))
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.clip_text = true
	return label

## `x` measured from the start edge, mirrored in Arabic.
func _at(x: float, width: float) -> float:
	return size.x - x - width if is_layout_rtl() else x

func _layout() -> void:
	_face.position = Vector2.ZERO
	_face.size = size
	var icon := HudTheme.px(ICON)
	_icon.size = Vector2.ONE * icon
	_icon.position = Vector2(_at(HudTheme.px(1.0), icon), (size.y - icon) * 0.5)
	# The amount and the line share the room between the icon and the far end of the pill.
	var start := icon + HudTheme.px(3.0)
	var room := maxf(0.0, size.x - start - HudTheme.px(PAD))
	var line := HudTheme.px(LINE)
	var line_y := size.y - HudTheme.px(FOOT) - line
	_amount.position = Vector2(_at(start, room), 0.0)
	_amount.size = Vector2(room, line_y)
	_track.position = Vector2(_at(start, room), line_y)
	_track.size = Vector2(room, line)
	var width := room * _fraction
	# The fill grows from the start edge of the track, seen through the clip so its rounded ends never squash.
	_clip.position = Vector2(_at(start, width), line_y)
	_clip.size = Vector2(width, line)
	_fill.position = Vector2(width - room if is_layout_rtl() else 0.0, 0.0)
	_fill.size = Vector2(room, line)
	_fit(_amount, AMOUNT_FONTS)

## The biggest of `sizes` at which the label's text fits its room.
func _fit(label: Label, sizes: Array[float]) -> void:
	var font := label.get_theme_font("font")
	for size_px in sizes:
		var px := HudTheme.font(size_px)
		if size_px == sizes[-1] or font.get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x <= label.size.x:
			if label.get_theme_font_size("font_size") != px:
				label.add_theme_font_size_override("font_size", px)
			return

## A release inside the cell is a tap (a finger that slid off is not).
func _on_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		if Rect2(Vector2.ZERO, size).has_point(event.position):
			pressed.emit()

## A quick bounce, as a reward lands in this store.
func pulse() -> void:
	if _pulse != null and _pulse.is_valid():
		_pulse.kill()
	pivot_offset = size / 2.0
	scale = Vector2.ONE
	_pulse = create_tween()
	_pulse.tween_property(self, "scale", Vector2.ONE * 1.14, 0.09).set_ease(Tween.EASE_OUT)
	_pulse.tween_property(self, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

## `state` is "normal", "near" or "full" (HudModel.chips); `fraction` is how full the store is (0 to 1).
func set_values(amount_text: String, state: String, fraction := 0.0) -> void:
	var to := clampf(fraction, 0.0, 1.0)
	var colour := bar_colour_for(state)
	if amount_text == _amount.text and state == _state and is_equal_approx(to, _fraction) and colour == _bar_colour:
		return
	_fraction = to
	_bar_colour = colour
	_fill_box.bg_color = colour
	_state = state
	_amount.text = amount_text
	_amount.add_theme_color_override("font_color", FULL if state == "full" else HudTheme.BUTTON_TEXT)
	_layout()

func bar_colour_for(state: String) -> Color:
	return FULL if state == "full" else (NEAR if state == "near" else _colour)

func amount_text() -> String:
	return _amount.text

func amount_colour() -> Color:
	return _amount.get_theme_color("font_color")

func is_full() -> bool:
	return _state == "full"

## The store's fill (0 to 100) and colour, for tests.
func bar_value() -> float:
	return _fraction * 100.0

func bar_colour() -> Color:
	return _bar_colour

## The line's drawn fill, in px, for tests.
func fill_rect() -> Rect2:
	return Rect2(_clip.position, _clip.size)

func line_rect() -> Rect2:
	return Rect2(_track.position, _track.size)
