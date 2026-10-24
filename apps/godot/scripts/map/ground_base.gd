class_name GroundBase
extends Node2D
## The smooth ground colour field: one pixel per tile on a single isometric quad with linear filtering, so colours blend
## between tile centres and no tile diamond shows (ground-field.ts). The pixel (x, y) is the colour of tile (x, y); the
## iso transform is affine, so UV (x + 0.5) / size lands exactly on the tile centre. The green wash goes over fertile
## ground on a child node (ground_wash.gdshader): the mottled grain multiplied by the fertility alpha, at GREEN_ALPHA.

const GREEN_FROM := 0.55
const GREEN_SLOPE := 2.5
const WASH_SHADER := preload("res://shaders/ground_wash.gdshader")

## Debug switch: draw the green wash.
var wash_visible := true:
	set(value):
		wash_visible = value
		_wash_view.visible = value

var _size := 0
var _field: ImageTexture
var _wash_view := Node2D.new()
var _wash_field: ImageTexture
var _grain: Texture2D

func _ready() -> void:
	add_child(_wash_view)
	_wash_view.draw.connect(_draw_wash)
	var mat := ShaderMaterial.new()
	mat.shader = WASH_SHADER
	_wash_view.material = mat

func setup(size: int, colours: PackedInt32Array, fertility: PackedFloat32Array) -> void:
	_size = size
	var field := Image.create_empty(size, size, false, Image.FORMAT_RGBA8)
	var wash := Image.create_empty(size, size, false, Image.FORMAT_RGBA8)
	for y in size:
		for x in size:
			var i := y * size + x
			var c := colours[i]
			field.set_pixel(x, y, Color8((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff, 255))
			# Only the alpha is used: the shader takes the colour and the grain.
			wash.set_pixel(x, y, Color(1, 1, 1, clampf((fertility[i] - GREEN_FROM) * GREEN_SLOPE, 0.0, 1.0)))
	_field = ImageTexture.create_from_image(field)
	_wash_field = ImageTexture.create_from_image(wash)
	if _grain == null:
		_grain = load(GroundGrain.GRAIN_PATH)
	var mat := _wash_view.material as ShaderMaterial
	mat.set_shader_parameter("fertility", _wash_field)
	mat.set_shader_parameter("grain", _grain)
	queue_redraw()
	_wash_view.queue_redraw()

func _draw() -> void:
	if _size == 0:
		return
	var corners := Iso.footprint(0, 0, _size, _size)
	var uvs := PackedVector2Array([Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)])
	var white := PackedColorArray([Color.WHITE, Color.WHITE, Color.WHITE, Color.WHITE])
	draw_polygon(corners, white, uvs, _field)

func _draw_wash() -> void:
	if _size == 0:
		return
	var corners := Iso.footprint(0, 0, _size, _size)
	var uvs := PackedVector2Array([Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)])
	var white := PackedColorArray([Color.WHITE, Color.WHITE, Color.WHITE, Color.WHITE])
	_wash_view.draw_polygon(corners, white, uvs)
