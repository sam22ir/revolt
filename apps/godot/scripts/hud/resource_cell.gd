class_name ResourceCell
extends HBoxContainer
## One resource in the top bar (look test): a flat icon, the amount in bold and the `+rate/h` under it. The store's cap shows
## only as a colour: a full store turns the amount gold and says "Full" in place of the rate, with no bar.

const ICON_TINT := {
	"food": Color("d8b64a"),
	"materiel": Color("c9c2b3"),
	"funds": Color("f0c060"),
	"support": Color("d8765a"),
}

var _icon: HudIcon
var _amount := Label.new()
var _rate := Label.new()

func _init(resource_id := "food") -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", roundi(HudTheme.px(5)))
	_icon = HudIcon.new(resource_id, 22.0, ICON_TINT.get(resource_id, HudTheme.TEXT))
	_icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	add_child(_icon)
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", 0)
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_amount.add_theme_font_override("font", load("res://fonts/IBMPlexSansArabic-Bold.ttf"))
	_amount.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_BODY))
	_rate.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_SMALL - 1))
	_rate.add_theme_color_override("font_color", HudTheme.TEXT_SECOND)
	for label in [_amount, _rate]:
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		label.clip_text = true
		label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		column.add_child(label)
	add_child(column)

## `state` is "normal", "near" or "full" (HudModel.chips): only "full" changes the look.
func set_values(amount_text: String, rate_text: String, state: String) -> void:
	var full := state == "full"
	_amount.text = amount_text
	_rate.text = Loc.t("hud.full") if full else rate_text
	var colour := HudTheme.GOLD if full else HudTheme.TEXT
	_amount.add_theme_color_override("font_color", colour)
	_rate.add_theme_color_override("font_color", HudTheme.GOLD if full else HudTheme.TEXT_SECOND)

func amount_text() -> String:
	return _amount.text

func rate_text() -> String:
	return _rate.text

func is_full() -> bool:
	return _amount.get_theme_color("font_color") == HudTheme.GOLD
