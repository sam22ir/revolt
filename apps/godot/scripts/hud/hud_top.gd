class_name HudTop
extends VBoxContainer
## The top of the Base and the Map: one board hanging from the screen's edge, round at the foot like the tab bar's top. A slim row of
## four resource pills (icon, amount and a line for how full the store is; the rate is in the sheet a tap opens), then the player at the start edge with the status beside it (builders on the base, marches on the map). The player opens
## Settings.

signal chip_pressed
## A resource pill was tapped (its id).
signal resource_pressed(id: String)

var cells := {}
var chip := PlayerChip.new()
var pill := QueuePill.new()
var marches := MarchesStrip.new()

## The board's whole height, in viewport px: the camp and the pages are fitted under it, so it must not change.
const HEIGHT := 272.0

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	var header := PanelContainer.new()
	header.mouse_filter = Control.MOUSE_FILTER_IGNORE
	header.custom_minimum_size.y = HEIGHT
	var board := HudTheme.slice("topboard", 44.0, 8.0, 6.0)
	# The lip is under the rows.
	board.content_margin_bottom = HudTheme.px(8.0)
	header.add_theme_stylebox_override("panel", board)
	add_child(header)
	var rows := VBoxContainer.new()
	rows.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rows.alignment = BoxContainer.ALIGNMENT_CENTER
	rows.add_theme_constant_override("separation", roundi(HudTheme.px(5)))
	header.add_child(rows)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", roundi(HudTheme.px(5)))
	rows.add_child(row)
	for id: String in Balance.data()["resourceIds"]:
		var cell := ResourceCell.new(id)
		cell.pressed.connect(func() -> void: resource_pressed.emit(id))
		row.add_child(cell)
		cells[id] = cell
	var strip := HBoxContainer.new()
	strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	strip.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	chip.pressed.connect(func() -> void: chip_pressed.emit())
	strip.add_child(chip)
	# On the map both can show: the marches then take only the room of their number, and the bar keeps its height.
	strip.add_child(marches)
	strip.add_child(pill)
	pill.visibility_changed.connect(_share_row)
	marches.visibility_changed.connect(_share_row)
	rows.add_child(strip)

func _share_row() -> void:
	marches.set_compact(pill.visible)
	pill.set_compact(marches.visible)

## Fills the cells from the chips (HudModel.chips): the amounts accrued to now and how full each store is.
func set_resources(chips: Array) -> void:
	var lang := Fmt.lang()
	for c: Dictionary in chips:
		cells[String(c["id"])].set_values(Fmt.amount(lang, c["amount"]), c["state"], float(c["fraction"]))

## The strip shows the builders on the base and the marches on the map.
func show_context(screen: String) -> void:
	marches.visible = screen == "map"
