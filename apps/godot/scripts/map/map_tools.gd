class_name MapTools
extends Control
## The map's own controls in the bottom corner at the reading end, above the nav bar: the minimap, the Find and My base buttons over it,
## and an arrow at the screen's edge pointing to the player's base while it is out of view, with how far it is.

signal jump(tile: Vector2i)
signal find_pressed
signal home_pressed

const GAP := 10.0
const BUTTON := 40.0
const ARROW := 15.0
const ARROW_MARGIN := 34.0

var minimap := Minimap.new()
var find_button := RoundButton.new("search", BUTTON)
var home_button := RoundButton.new("base", BUTTON)
var _distance := Label.new()
var _arrow: Dictionary = {}
var _bottom := 0.0

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	minimap.jump.connect(func(t: Vector2i) -> void: jump.emit(t))
	add_child(minimap)
	find_button.pressed.connect(func() -> void: find_pressed.emit())
	home_button.pressed.connect(func() -> void: home_pressed.emit())
	add_child(find_button)
	add_child(home_button)
	_distance.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_distance.add_theme_font_size_override("font_size", HudTheme.font(HudTheme.FONT_SMALL))
	_distance.add_theme_color_override("font_color", HudTheme.TEXT)
	_distance.add_theme_color_override("font_outline_color", Color(0.15, 0.1, 0.07, 0.95))
	_distance.add_theme_constant_override("outline_size", roundi(HudTheme.px(4)))
	add_child(_distance)
	refresh_language()

func refresh_language() -> void:
	# Icons only: two labels side by side would not fit over the minimap.
	find_button.button().tooltip_text = Loc.t("map.findTitle")
	home_button.button().tooltip_text = Loc.t("map.myBase")
	minimap.tooltip_text = Loc.t("map.minimap")

## Places the corner: `bottom` is the room kept free under it (the nav bar), `rtl` puts it at the left.
func place(bottom: float, rtl: bool) -> void:
	_bottom = bottom
	var vp := get_viewport_rect().size
	var side := HudTheme.px(GAP)
	var m := minimap.custom_minimum_size
	var x := side if rtl else vp.x - side - m.x
	minimap.position = Vector2(x, vp.y - bottom - side - m.y)
	minimap.size = m
	var fb := find_button.get_combined_minimum_size()
	var hb := home_button.get_combined_minimum_size()
	var y := minimap.position.y - HudTheme.px(4) - maxf(fb.y, hb.y)
	# My base at the reading end, Find beside it.
	var home_x := x + m.x - hb.x if not rtl else x
	var find_x := home_x - fb.x - HudTheme.px(6) if not rtl else home_x + hb.x + HudTheme.px(6)
	home_button.position = Vector2(home_x, y)
	home_button.size = hb
	find_button.position = Vector2(find_x, y)
	find_button.size = fb

## The box the corner's controls cover, so the base arrow keeps out of it.
func corner_rect() -> Rect2:
	return minimap.get_rect().merge(home_button.get_rect()).merge(find_button.get_rect())

## The arrow to the base: `base_screen` is its place on the screen, `band` the map's free area between the HUD bars; `tiles` how far away.
func set_arrow(base_screen: Vector2, band: Rect2, tiles: int) -> void:
	_arrow = MinimapMath.edge_arrow(base_screen, band, HudTheme.px(ARROW_MARGIN), corner_rect().grow(HudTheme.px(8)))
	_distance.visible = not _arrow.is_empty()
	if _distance.visible:
		_distance.text = Loc.t("map.baseDistance", {"count": Fmt.amount(Fmt.lang(), tiles)})
		_distance.reset_size()
		var at: Vector2 = _arrow["at"]
		var back := Vector2.from_angle(float(_arrow["angle"])) * HudTheme.px(ARROW + 14.0)
		_distance.position = at - back - _distance.size / 2.0
		var vp := get_viewport_rect().size
		_distance.position = _distance.position.clamp(Vector2.ZERO, vp - _distance.size)
	queue_redraw()

func clear_arrow() -> void:
	_arrow = {}
	_distance.visible = false
	queue_redraw()

func _draw() -> void:
	if _arrow.is_empty():
		return
	var at: Vector2 = _arrow["at"]
	var a := float(_arrow["angle"])
	var s := HudTheme.px(ARROW)
	var tip := at + Vector2.from_angle(a) * s
	var left := at + Vector2.from_angle(a + 2.4) * s
	var right := at + Vector2.from_angle(a - 2.4) * s
	var pts := PackedVector2Array([tip, left, at - Vector2.from_angle(a) * s * 0.25, right])
	draw_colored_polygon(pts, HudTheme.GOLD)
	pts.append(tip)
	draw_polyline(pts, Color(0.15, 0.1, 0.07, 0.95), HudTheme.px(2), true)
