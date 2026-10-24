class_name GroundFrame
extends Node2D
## What surrounds the map's top face: a mask in the world background colour (so decals and wide strokes never float past the
## map edge) and the slab rim below the two near sides (ground-bake.ts paintRim: 22 px deep, two shades).

const BACKGROUND := Color("30251c")
const RIM := 22.0
const RIM_TOP := Color("4a3a2c")
const RIM_SIDE := Color("3a2d22")
const FAR := 8000.0

var _size := 0

func setup(size: int) -> void:
	_size = size
	queue_redraw()

func _draw() -> void:
	if _size == 0:
		return
	var top := Iso.tile_to_world(0, 0)
	var right := Iso.tile_to_world(_size, 0)
	var bottom := Iso.tile_to_world(_size, _size)
	var left := Iso.tile_to_world(0, _size)
	# The four pieces of the outside of the diamond, out to a far rectangle.
	draw_colored_polygon(PackedVector2Array([Vector2(-FAR, -FAR), Vector2(top.x, -FAR), top, left, Vector2(-FAR, left.y)]), BACKGROUND)
	draw_colored_polygon(PackedVector2Array([Vector2(top.x, -FAR), Vector2(FAR, -FAR), Vector2(FAR, right.y), right, top]), BACKGROUND)
	draw_colored_polygon(PackedVector2Array([Vector2(-FAR, left.y), left, bottom, Vector2(bottom.x, FAR), Vector2(-FAR, FAR)]), BACKGROUND)
	draw_colored_polygon(PackedVector2Array([right, Vector2(FAR, right.y), Vector2(FAR, FAR), Vector2(bottom.x, FAR), bottom]), BACKGROUND)
	# The rim goes on top of the mask: it hangs below the near edges.
	draw_colored_polygon(PackedVector2Array([left, bottom, bottom + Vector2(0, RIM), left + Vector2(0, RIM)]), RIM_TOP)
	draw_colored_polygon(PackedVector2Array([bottom, right, right + Vector2(0, RIM), bottom + Vector2(0, RIM)]), RIM_SIDE)
