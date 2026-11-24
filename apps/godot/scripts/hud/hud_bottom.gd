class_name HudBottom
extends HBoxContainer
## The tab bar: one rounded board across the screen's foot with five even tabs (NavTab): Heroes and Alliance, the green Base/Map switch
## in the middle, then Reports and Settings (mirrored in Arabic, because the row follows the layout direction). The switch shows where
## it goes, not where you are; the open page's tab is raised.

signal page_requested(page: String)
signal switch_requested(target: String)

const PAGES: Array[String] = ["heroes", "alliance", "reports", "settings"]
const PAGE_ICONS := {"heroes": "heroes", "alliance": "alliance", "reports": "reports", "settings": "settings"}
## The switch's slot among the pages: the middle of five.
const SWITCH_SLOT := 2
## Room the bar needs above the screen's bottom edge, in viewport px. The camp's fit, the pages and the map's panels all stop at it.
const HEIGHT := 252
## How far the shell insets this row from the screen's sides and bottom, in mockup px; the board reaches past it to the edges.
const INSET_SIDE := 6.0
const INSET_BOTTOM := 6.0

var buttons := {}
var switch := NavTab.new("map", true)
var _target := "map"
var _board := HudTheme.slice("tabbar", 44.0, 0.0, 0.0)

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	layout_direction = Control.LAYOUT_DIRECTION_LOCALE
	add_theme_constant_override("separation", 0)
	switch.pressed.connect(func() -> void: switch_requested.emit(_target))
	for id in PAGES:
		if get_child_count() == SWITCH_SLOT:
			add_child(switch)
		var tab := NavTab.new(PAGE_ICONS[id])
		tab.pressed.connect(func() -> void: page_requested.emit(id))
		add_child(tab)
		buttons[id] = tab
	sort_children.connect(queue_redraw)
	resized.connect(queue_redraw)

func _draw() -> void:
	var side := HudTheme.px(INSET_SIDE)
	draw_style_box(_board, Rect2(-side - 4.0, 0.0, size.x + side * 2.0 + 8.0, size.y + HudTheme.px(INSET_BOTTOM) + 4.0))
	# A thin groove between neighbours that both lie flat.
	var tabs := get_children()
	tabs.sort_custom(func(a: Control, b: Control) -> bool: return a.position.x < b.position.x)
	for i in range(1, tabs.size()):
		var left := tabs[i - 1] as NavTab
		var right := tabs[i] as NavTab
		if left.slab_shown() or right.slab_shown():
			continue
		var top := size.y * 0.24
		var foot := size.y * 0.82
		draw_rect(Rect2(right.position.x - 2.0, top, 3.0, foot - top), Color(0, 0, 0, 0.4))
		draw_rect(Rect2(right.position.x + 1.0, top, 2.0, foot - top), Color(1.0, 0.85, 0.6, 0.14))

## Shows where the switch goes from `screen` ("base", "map" or a page).
func set_screen(screen: String) -> void:
	_target = HudModel.switch_target(screen)
	switch.set_icon(_target)
	switch.set_label(Loc.t("nav." + _target))
	for id: String in buttons:
		buttons[id].set_active(id == screen)
	queue_redraw()

func target() -> String:
	return _target

func refresh_language() -> void:
	for id: String in buttons:
		buttons[id].set_label(Loc.t("nav." + id))
		buttons[id].place_dot(Fmt.lang())
	switch.set_label(Loc.t("nav." + _target))
