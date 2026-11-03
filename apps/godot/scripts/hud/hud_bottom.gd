class_name HudBottom
extends HBoxContainer
## The bottom of the Base and the Map: a full-width bronze band with Heroes, Alliance and Reports as round buttons with labels from
## the start edge, and the Base/Map switch as a big round button in the corner at the end edge (bottom right in English, bottom left
## in Arabic, because the row follows the layout direction). The switch shows where it goes, not where you are.

signal page_requested(page: String)
signal switch_requested(target: String)

const PAGES: Array[String] = ["heroes", "alliance", "reports"]
const PAGE_ICONS := {"heroes": "heroes", "alliance": "alliance", "reports": "reports"}
## Room the bar needs above the screen's bottom edge, in viewport px: the switch, its label and the margin under it.
const HEIGHT := 252
## How far the shell insets this row from the screen's sides and bottom, in mockup px; the band reaches past it to the edges.
const INSET_SIDE := 10.0
const INSET_BOTTOM := 8.0

var buttons := {}
var switch := RoundButton.new("map", HudTheme.SWITCH, true)
var _target := "map"
var _band := HudTheme.band()

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	alignment = BoxContainer.ALIGNMENT_BEGIN
	add_theme_constant_override("separation", roundi(HudTheme.px(14)))
	for id in PAGES:
		var b := RoundButton.new(PAGE_ICONS[id], HudTheme.ROUND_BUTTON)
		b.size_flags_vertical = Control.SIZE_SHRINK_END
		b.pressed.connect(func() -> void: page_requested.emit(id))
		add_child(b)
		buttons[id] = b
	var gap := Control.new()
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_child(gap)
	switch.size_flags_vertical = Control.SIZE_SHRINK_END
	switch.pressed.connect(func() -> void: switch_requested.emit(_target))
	add_child(switch)

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		queue_redraw()

func _draw() -> void:
	var side := HudTheme.px(INSET_SIDE)
	draw_style_box(_band, Rect2(-side, 0.0, size.x + side * 2.0, size.y + HudTheme.px(INSET_BOTTOM)))

## Shows where the switch goes from `screen` ("base", "map" or a page).
func set_screen(screen: String) -> void:
	_target = HudModel.switch_target(screen)
	switch.set_icon(_target)
	switch.set_label(Loc.t("nav." + _target))
	for id: String in buttons:
		buttons[id].set_active(id == screen)

func target() -> String:
	return _target

func refresh_language() -> void:
	for id: String in buttons:
		buttons[id].set_label(Loc.t("nav." + id))
		buttons[id].place_dot(Fmt.lang())
	switch.set_label(Loc.t("nav." + _target))
