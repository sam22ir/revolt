class_name HudBottom
extends HBoxContainer
## The bottom of the Base and the Map: a full-width bronze band with five evenly spread slots: Heroes and Alliance, the Base/Map
## switch as a big round button in the middle, then Reports and Settings (mirrored in Arabic, because the row follows the layout
## direction). The switch shows where it goes, not where you are.

signal page_requested(page: String)
signal switch_requested(target: String)

const PAGES: Array[String] = ["heroes", "alliance", "reports", "settings"]
const PAGE_ICONS := {"heroes": "heroes", "alliance": "alliance", "reports": "reports", "settings": "settings"}
## The switch's slot among the page buttons: the middle of five.
const SWITCH_SLOT := 2
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
	add_theme_constant_override("separation", 0)
	switch.size_flags_vertical = Control.SIZE_SHRINK_END
	switch.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	switch.pressed.connect(func() -> void: switch_requested.emit(_target))
	for id in PAGES:
		if get_child_count() == SWITCH_SLOT:
			add_child(switch)
		var b := RoundButton.new(PAGE_ICONS[id], HudTheme.ROUND_BUTTON)
		b.size_flags_vertical = Control.SIZE_SHRINK_END
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(func() -> void: page_requested.emit(id))
		add_child(b)
		buttons[id] = b

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
