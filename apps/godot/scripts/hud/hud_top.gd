class_name HudTop
extends VBoxContainer
## The top of the Base and the Map (look test): the resource bar (four cells), then the player chip at the start edge with the
## context strip beside it (builders on the base, marches on the map). The chip opens Settings. Nothing here is shown on the
## other pages.

signal chip_pressed

var cells := {}
var chip := PlayerChip.new()
var pill := QueuePill.new()
var marches := MarchesStrip.new()

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	var bar := PanelContainer.new()
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.add_theme_stylebox_override("panel", HudTheme.panel(HudTheme.RADIUS, 8.0, 6.0))
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(6)))
	bar.add_child(row)
	for id: String in Balance.data()["resourceIds"]:
		var cell := ResourceCell.new(id)
		row.add_child(cell)
		cells[id] = cell
	add_child(bar)
	var strip := HBoxContainer.new()
	strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	chip.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	chip.pressed.connect(func() -> void: chip_pressed.emit())
	strip.add_child(chip)
	var context := VBoxContainer.new()
	context.mouse_filter = Control.MOUSE_FILTER_IGNORE
	context.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	context.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	context.add_child(pill)
	context.add_child(marches)
	strip.add_child(context)
	add_child(strip)

## Fills the cells from the amounts accrued to now, `rates` (HudModel.rates) and the chips' states (HudModel.chips).
func set_resources(chips: Array, rates: Dictionary) -> void:
	var lang := Fmt.lang()
	for c: Dictionary in chips:
		var id: String = c["id"]
		var rate_text := Loc.t("hud.rate", {"amount": Fmt.amount(lang, float(rates.get(id, 0.0)))})
		cells[id].set_values(Fmt.amount(lang, c["amount"]), rate_text, c["state"])

## The strip shows the builders on the base and the marches on the map.
func show_context(screen: String) -> void:
	marches.visible = screen == "map"
