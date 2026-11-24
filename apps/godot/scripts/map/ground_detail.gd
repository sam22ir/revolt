class_name GroundDetail
extends Node2D
## The fine MULTIPLY detail over the baked ground (DetailLayer in ground-detail.ts), drawn after the features and before the
## props. One quad over the map's footprint, repeating in world px from the origin, so it never moves with the camera. Faded
## by zoom in the shader (ground_detail.gdshader); not drawn at all below FADE_OUT.

const FADE_OUT := 0.35
const FADE_IN := 0.6
const DETAIL_SIZE := 512

## The texture is seed-independent and baked to PNG (GroundGrain.DETAIL_PATH), loaded once per run.
static var _texture: Texture2D = null

static var _shader: Shader = preload("res://shaders/ground_detail.gdshader")

var _size := 0
var _fade := 0.0
var _part_on := true
var _mat := ShaderMaterial.new()

func _ready() -> void:
	_mat.shader = _shader
	material = _mat
	# The first map build can come after a zoom was already set, so the visibility is worked out here as well.
	visible = _part_on and _fade > 0.0
	draw.connect(_draw_quad)

## Opacity of the overlay at a view zoom: 0 at or below FADE_OUT, 1 at or above FADE_IN, smoothstep between. Pure.
static func alpha_at(zoom: float) -> float:
	var t := clampf((zoom - FADE_OUT) / (FADE_IN - FADE_OUT), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

func setup(size: int) -> void:
	_size = size
	if _texture == null:
		_texture = load(GroundGrain.DETAIL_PATH)
	_mat.set_shader_parameter("detail", _texture)
	queue_redraw()

## Called when the camera zoom changes. Sets the fade, and hides the node when it is zero.
func set_zoom(view_zoom: float) -> void:
	var fade := alpha_at(view_zoom)
	if fade != _fade:
		_fade = fade
		_mat.set_shader_parameter("fade", fade)
	visible = _part_on and fade > 0.0

## Debug switch from the page URL (`?hide=detail`).
func set_part_visible(on: bool) -> void:
	_part_on = on
	visible = on and _fade > 0.0

func _draw_quad() -> void:
	if _size == 0:
		return
	# Over the land past the frontier too, as far as its haze lets it be seen.
	var corners := Frontier.outline(_size, Frontier.DECAL_DEPTH)
	var uvs := PackedVector2Array([Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)])
	var white := PackedColorArray([Color.WHITE, Color.WHITE, Color.WHITE, Color.WHITE])
	draw_polygon(corners, white, uvs)
