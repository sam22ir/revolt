class_name FrontierHaze
extends Node2D
## Dust over the land past the frontier: nothing at the fence, thickening outward, so the land seems to go on for ever.

const COLOUR := Color("8c7756")
const FROM := 5.0
const TO := 40.0
const THICK := 0.94
const FAR := 8000.0

var _size := 0

func setup(size: int) -> void:
	_size = size
	queue_redraw()

func _draw() -> void:
	if _size == 0:
		return
	var inner := Frontier.outline(_size, FROM)
	var outer := Frontier.outline(_size, TO)
	var clear := Color(COLOUR, 0.0)
	var thick := Color(COLOUR, THICK)
	for i in 4:
		var j := (i + 1) % 4
		draw_polygon(PackedVector2Array([inner[i], inner[j], outer[j], outer[i]]), PackedColorArray([clear, clear, thick, thick]))
	for piece in GroundFrame.outside_of(outer):
		draw_colored_polygon(piece, thick)
