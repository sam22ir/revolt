class_name SegmentBar
extends Control
## One bar split into coloured parts from the reading start (survivors, wounded, lost). What the parts don't reach stays dark.

const HEIGHT := 14.0
const RIM := 4.0

## [[value, Color], ...]
var parts: Array = []
var total := 1.0
var _track := HudTheme.flat(Color("150c06"), 7.0, HudTheme.BUTTON_INK, 1.4)

func _init(of_total := 1.0, with_parts := []) -> void:
	total = maxf(1.0, of_total)
	parts = with_parts
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	custom_minimum_size.y = HudTheme.px(HEIGHT)
	resized.connect(queue_redraw)

## The parts' rectangles, in drawing order (for tests too).
func rects() -> Array[Rect2]:
	var out: Array[Rect2] = []
	var room := size.x - RIM * 2.0
	var at := 0.0
	for part: Array in parts:
		var width := room * clampf(float(part[0]) / total, 0.0, 1.0)
		out.append(Rect2(RIM + at if not is_layout_rtl() else size.x - RIM - at - width, RIM, width, size.y - RIM * 2.0))
		at += width
	return out

func _draw() -> void:
	draw_style_box(_track, Rect2(Vector2.ZERO, size))
	var boxes := rects()
	for i in boxes.size():
		if boxes[i].size.x < 1.0:
			continue
		draw_rect(boxes[i], parts[i][1])
		draw_rect(Rect2(boxes[i].position, Vector2(boxes[i].size.x, boxes[i].size.y * 0.4)), Color(1, 1, 1, 0.16))
