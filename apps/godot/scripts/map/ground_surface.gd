class_name GroundSurface
extends Node2D
## The inked ground itself: one quad over the map and the land past its frontier, drawn by shaders/map_ground.gdshader from the two
## fields of GroundField and the seamless materials (art/ground, from tools/blender/map_ground.py).

const SHADER: Shader = preload("res://shaders/map_ground.gdshader")
const DIR := "res://art/ground/"
## Tiles past the map's edge that are drawn; the haze is as good as solid there.
const BEYOND := 56.0

var _size := 0
var _mat := ShaderMaterial.new()

func _ready() -> void:
	_mat.shader = SHADER
	_mat.set_shader_parameter("materials", load(DIR + "materials.webp"))
	_mat.set_shader_parameter("cliff_tex", load(DIR + "cliff.webp"))
	_mat.set_shader_parameter("noise_tex", load(DIR + "noise.png"))
	_mat.set_shader_parameter("T1", GroundField.T1)
	_mat.set_shader_parameter("T2", GroundField.T2)
	_mat.set_shader_parameter("T3", GroundField.T3)
	material = _mat

## `land` and `features` are GroundField's pictures.
func setup(size: int, land: Image, features: Image) -> void:
	_size = size
	_mat.set_shader_parameter("map_size", float(size))
	_mat.set_shader_parameter("land", ImageTexture.create_from_image(land))
	_mat.set_shader_parameter("feature", ImageTexture.create_from_image(features))
	_mat.set_shader_parameter("strip_from", Frontier.INNER)
	_mat.set_shader_parameter("strip_to", Frontier.OUTER)
	queue_redraw()

## The regions (id per tile) and which are liberated.
func set_regions(size: int, regions: PackedInt32Array, liberated: Dictionary) -> void:
	var bytes := PackedByteArray()
	bytes.resize(size * size * 2)
	for i in size * size:
		bytes[i * 2] = regions[i] % 256
		bytes[i * 2 + 1] = 255 if liberated.has(regions[i]) else 0
	_mat.set_shader_parameter("regions", ImageTexture.create_from_image(Image.create_from_data(size, size, false, Image.FORMAT_RG8, bytes)))

func _draw() -> void:
	if _size > 0:
		draw_colored_polygon(Frontier.outline(_size, BEYOND), Color.WHITE)
