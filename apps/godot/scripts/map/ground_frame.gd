class_name GroundFrame
extends Node2D
## What surrounds the map's top face: a mask in the world background colour (so decals and wide strokes never float past the
## map edge) and the slab rim below the two near sides (ground-bake.ts paintRim: 22 px deep, two shades).

const BACKGROUND := Color("1d120a")
## The walnut table the map lies on, darkened so the map stays the brightest thing.
const TABLE: Texture2D = preload("res://art/kit/fill_wood.webp")
const TABLE_TINT := Color(0.66, 0.62, 0.58)
const RIM := 22.0
const RIM_TOP := Color("4a3a2c")
const RIM_SIDE := Color("3a2d22")
const FAR := 8000.0

var _size := 0

func setup(size: int) -> void:
	texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_size = size
	queue_redraw()

## The table's planks keep one size in the world, so they zoom with the map.
static func _table_uvs(points: PackedVector2Array) -> PackedVector2Array:
	var uvs := PackedVector2Array()
	for p in points:
		uvs.append(p / TABLE.get_size())
	return uvs

func _draw() -> void:
	if _size == 0:
		return
	var look := GroundStyle.params()
	var background: Color = BACKGROUND if look.is_empty() else look["background"]
	var rim_top: Color = RIM_TOP if look.is_empty() else background.darkened(0.2)
	var rim_side: Color = RIM_SIDE if look.is_empty() else background.darkened(0.32)
	var top := Iso.tile_to_world(0, 0)
	var right := Iso.tile_to_world(_size, 0)
	var bottom := Iso.tile_to_world(_size, _size)
	var left := Iso.tile_to_world(0, _size)
	# The four pieces of the outside of the diamond, out to a far rectangle.
	var outside: Array[PackedVector2Array] = [
		PackedVector2Array([Vector2(-FAR, -FAR), Vector2(top.x, -FAR), top, left, Vector2(-FAR, left.y)]),
		PackedVector2Array([Vector2(top.x, -FAR), Vector2(FAR, -FAR), Vector2(FAR, right.y), right, top]),
		PackedVector2Array([Vector2(-FAR, left.y), left, bottom, Vector2(bottom.x, FAR), Vector2(-FAR, FAR)]),
		PackedVector2Array([right, Vector2(FAR, right.y), Vector2(FAR, FAR), Vector2(bottom.x, FAR), bottom]),
	]
	for piece in outside:
		if look.is_empty():
			draw_colored_polygon(piece, TABLE_TINT, _table_uvs(piece), TABLE)
		else:
			# The look-test variants fade into their own plain colour.
			draw_colored_polygon(piece, background)
	if not look.is_empty():
		_draw_fade(background, [top, right, bottom, left], float(look["fade"]))
	# The rim goes on top of the mask: it hangs below the near edges.
	draw_colored_polygon(PackedVector2Array([left, bottom, bottom + Vector2(0, RIM), left + Vector2(0, RIM)]), rim_top)
	draw_colored_polygon(PackedVector2Array([bottom, right, right + Vector2(0, RIM), bottom + Vector2(0, RIM)]), rim_side)

## The map edge fades out: along each of the four edges a band of `tiles` tiles runs from the background colour at the edge to
## clear inside, so the ground melts into the surround instead of ending on a hard line.
func _draw_fade(colour: Color, corners: Array, tiles: float) -> void:
	var centre := Iso.tile_to_world(_size * 0.5, _size * 0.5)
	var clear := Color(colour, 0.0)
	for i in 4:
		var a: Vector2 = corners[i]
		var b: Vector2 = corners[(i + 1) % 4]
		var depth := tiles / (_size * 0.5)
		var a_in := a.lerp(centre, depth)
		var b_in := b.lerp(centre, depth)
		draw_polygon(PackedVector2Array([a, b, b_in, a_in]), PackedColorArray([colour, colour, clear, clear]))
