class_name ClockIcon
extends Control
## A small clock drawn in code (a ring and two hands), for durations, until the painted icon set has one.

var tint := HudTheme.TEXT

## `size` is in mockup px (see HudTheme).
func _init(size := 18.0, colour := HudTheme.TEXT) -> void:
	custom_minimum_size = Vector2.ONE * HudTheme.px(size)
	tint = colour
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _draw() -> void:
	var r := minf(size.x, size.y) * 0.5
	var c := size * 0.5
	var w := maxf(2.0, r * 0.16)
	draw_arc(c, r - w * 0.5, 0.0, TAU, 32, tint, w, true)
	draw_line(c, c + Vector2(0, -r * 0.55), tint, w, true)
	draw_line(c, c + Vector2(r * 0.4, 0), tint, w, true)
