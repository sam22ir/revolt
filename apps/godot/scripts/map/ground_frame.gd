class_name GroundFrame
extends Node2D
## What surrounds the map's top face: the land past the frontier (the map's own colour field mirrored outward, duller, so it meets the edge
## without a seam and goes on for ever) and the raked strip of the frontier on it. It also masks the decals and wide strokes that float past
## the map edge. The look-test variants keep their plain surround and slab rim (ground-bake.ts paintRim).

const BACKGROUND := Color("1d120a")
const LAND_TINT := Color(0.8, 0.76, 0.71)
const RIM := 22.0
const FAR := 8000.0

var _size := 0
var _field: Texture2D

func setup(size: int) -> void:
	texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_size = size
	queue_redraw()

## The four pieces of the plane outside a diamond (top, right, bottom, left corners), out to a far rectangle.
static func outside_of(corners: PackedVector2Array) -> Array[PackedVector2Array]:
	var top := corners[0]
	var right := corners[1]
	var bottom := corners[2]
	var left := corners[3]
	return [
		PackedVector2Array([Vector2(-FAR, -FAR), Vector2(top.x, -FAR), top, left, Vector2(-FAR, left.y)]),
		PackedVector2Array([Vector2(top.x, -FAR), Vector2(FAR, -FAR), Vector2(FAR, right.y), right, top]),
		PackedVector2Array([Vector2(-FAR, left.y), left, bottom, Vector2(bottom.x, FAR), Vector2(-FAR, FAR)]),
		PackedVector2Array([right, Vector2(FAR, right.y), Vector2(FAR, FAR), Vector2(bottom.x, FAR), bottom]),
	]

func _draw() -> void:
	if _size > 0:
		_draw_strip()

## The shadow line each fence stands on (the raked strip itself is the ground shader's).
func _draw_strip() -> void:
	for out: float in [Frontier.INNER, Frontier.OUTER]:
		var a := Frontier.outline(_size, out - 0.12)
		var b := Frontier.outline(_size, out + 0.3)
		for i in 4:
			var j := (i + 1) % 4
			draw_polygon(PackedVector2Array([a[i], a[j], b[j], b[i]]), PackedColorArray([Color(0, 0, 0, 0.5), Color(0, 0, 0, 0.5), Color(0, 0, 0, 0.0), Color(0, 0, 0, 0.0)]))
