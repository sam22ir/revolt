class_name GroundFrame
extends Node2D
## What surrounds the map's top face: the land past the frontier (the map's own colour field mirrored outward, duller, so it meets the edge
## without a seam and goes on for ever) and the raked strip of the frontier on it. It also masks the decals and wide strokes that float past
## the map edge. The look-test variants keep their plain surround and slab rim (ground-bake.ts paintRim).

const BACKGROUND := Color("1d120a")
const LAND_TINT := Color(0.8, 0.76, 0.71)
const RAKED: Texture2D = preload("res://art/frontier/raked.webp")
## Tiles one repeat of the raked sand covers along the edge.
const RAKED_TILES := 4.0
const RIM := 22.0
const FAR := 8000.0

var _size := 0
var _field: Texture2D

func setup(size: int, field: Texture2D) -> void:
	texture_repeat = CanvasItem.TEXTURE_REPEAT_MIRROR
	_size = size
	_field = field
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
	if _size == 0:
		return
	var look := GroundStyle.params()
	if look.is_empty():
		_draw_land()
		_draw_strip()
	else:
		_draw_plain(look)

## The colour field's UV is the tile over the size; past 0 and 1 the sampler mirrors it.
func _draw_land() -> void:
	for piece in outside_of(Frontier.outline(_size, 0.0)):
		var uvs := PackedVector2Array()
		for p in piece:
			uvs.append(Iso.world_to_tile(p) / _size)
		draw_colored_polygon(piece, LAND_TINT, uvs, _field)

## The raked strip between the fences, with soft shoulders, and the shadow line each fence stands on.
func _draw_strip() -> void:
	var bands: Array = [[-0.25, Frontier.INNER, 0.0, 1.0], [Frontier.INNER, Frontier.OUTER, 1.0, 1.0], [Frontier.OUTER, Frontier.OUTER + 0.8, 1.0, 0.0]]
	var span := Frontier.OUTER + 1.05
	for band: Array in bands:
		var near := Frontier.outline(_size, band[0])
		var far := Frontier.outline(_size, band[1])
		var u := (_size + Frontier.OUTER * 2.0) / RAKED_TILES
		var v0 := (float(band[0]) + 0.25) / span
		var v1 := (float(band[1]) + 0.25) / span
		for i in 4:
			var j := (i + 1) % 4
			draw_polygon(PackedVector2Array([near[i], near[j], far[j], far[i]]),
				PackedColorArray([Color(1, 1, 1, band[2]), Color(1, 1, 1, band[2]), Color(1, 1, 1, band[3]), Color(1, 1, 1, band[3])]),
				PackedVector2Array([Vector2(0, v0), Vector2(u, v0), Vector2(u, v1), Vector2(0, v1)]), RAKED)
	for out: float in [Frontier.INNER, Frontier.OUTER]:
		var a := Frontier.outline(_size, out - 0.12)
		var b := Frontier.outline(_size, out + 0.3)
		for i in 4:
			var j := (i + 1) % 4
			draw_polygon(PackedVector2Array([a[i], a[j], b[j], b[i]]), PackedColorArray([Color(0, 0, 0, 0.5), Color(0, 0, 0, 0.5), Color(0, 0, 0, 0.0), Color(0, 0, 0, 0.0)]))

func _draw_plain(look: Dictionary) -> void:
	var background: Color = look["background"]
	var corners := Frontier.outline(_size, 0.0)
	for piece in outside_of(corners):
		draw_colored_polygon(piece, background)
	_draw_fade(background, Array(corners), float(look["fade"]))
	var down := Vector2(0, RIM)
	# The rim goes on top of the mask: it hangs below the near edges.
	draw_colored_polygon(PackedVector2Array([corners[3], corners[2], corners[2] + down, corners[3] + down]), background.darkened(0.2))
	draw_colored_polygon(PackedVector2Array([corners[2], corners[1], corners[1] + down, corners[2] + down]), background.darkened(0.32))

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
