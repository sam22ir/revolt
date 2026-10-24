class_name GroundBase
extends Node2D
## The smooth ground colour field: one pixel per tile on a single isometric quad with linear filtering, so colours blend
## between tile centres and no tile diamond shows (ground-field.ts). The pixel (x, y) is the colour of tile (x, y); the
## iso transform is affine, so UV (x + 0.5) / size lands exactly on the tile centre. A feathered olive wash goes over
## fertile ground (greenPixels: starts at fertility 0.55, slope 2.5).

const GREEN_FROM := 0.55
const GREEN_SLOPE := 2.5
const GREEN_RGB := Color8(52, 64, 30)
## Phaser multiplies the wash by a mottled grain (mean alpha about 0.23) and GREEN_ALPHA 0.6; without the grain texture the
## equivalent flat strength is about 0.14.
const WASH_STRENGTH := 0.14

## Debug switch: draw the green wash.
var wash_visible := true
var _size := 0
var _field: ImageTexture
var _wash: ImageTexture

func setup(size: int, colours: PackedInt32Array, fertility: PackedFloat32Array) -> void:
	_size = size
	var field := Image.create_empty(size, size, false, Image.FORMAT_RGBA8)
	var wash := Image.create_empty(size, size, false, Image.FORMAT_RGBA8)
	for y in size:
		for x in size:
			var i := y * size + x
			var c := colours[i]
			field.set_pixel(x, y, Color8((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff, 255))
			var w := clampf((fertility[i] - GREEN_FROM) * GREEN_SLOPE, 0.0, 1.0)
			wash.set_pixel(x, y, Color(GREEN_RGB, w))
	_field = ImageTexture.create_from_image(field)
	_wash = ImageTexture.create_from_image(wash)
	queue_redraw()

func _draw() -> void:
	if _size == 0:
		return
	var corners := Iso.footprint(0, 0, _size, _size)
	var uvs := PackedVector2Array([Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)])
	var white := PackedColorArray([Color.WHITE, Color.WHITE, Color.WHITE, Color.WHITE])
	draw_polygon(corners, white, uvs, _field)
	if not wash_visible:
		return
	var wash_tint := Color(1, 1, 1, WASH_STRENGTH)
	draw_polygon(corners, PackedColorArray([wash_tint, wash_tint, wash_tint, wash_tint]), uvs, _wash)
