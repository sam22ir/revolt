class_name ResourceChip
extends VBoxContainer
## One resource in the HUD (ui/hud.ts): its name and amount, and a thin bar of how full the store is, which turns amber near
## the cap and red at it. The bar fills from the start side of the layout, so it runs right to left in Arabic.

const NORMAL := Color8(0xe0, 0xb0, 0x40)
const NEAR := Color8(0xe0, 0x80, 0x30)
const FULL := Color8(0xc8, 0x48, 0x38)
const TRACK := Color(0, 0, 0, 0.45)
const FONT := 34

var _name := Label.new()
var _value := Label.new()
var _bar := ProgressBar.new()
var _fill := StyleBoxFlat.new()

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	add_theme_constant_override("separation", 2)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for label in [_name, _value]:
		label.add_theme_font_size_override("font_size", FONT)
		label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
		label.add_theme_constant_override("outline_size", 8)
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(_name)
	row.add_child(_value)
	add_child(row)
	_bar.min_value = 0.0
	_bar.max_value = 1.0
	_bar.step = 0.0
	_bar.show_percentage = false
	_bar.custom_minimum_size.y = 8
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var track := StyleBoxFlat.new()
	track.bg_color = TRACK
	track.set_corner_radius_all(4)
	_fill.bg_color = NORMAL
	_fill.set_corner_radius_all(4)
	_bar.add_theme_stylebox_override("background", track)
	_bar.add_theme_stylebox_override("fill", _fill)
	add_child(_bar)

func set_name_text(text: String) -> void:
	_name.text = text

func set_value_text(text: String) -> void:
	_value.text = text

## `state` is "normal", "near" or "full" (HudModel.chips).
func set_fill(fraction: float, state: String) -> void:
	_bar.value = fraction
	_fill.bg_color = FULL if state == "full" else (NEAR if state == "near" else NORMAL)

func bar() -> ProgressBar:
	return _bar
