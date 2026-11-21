class_name Camp3dTest
extends Node3D
## Dev-only look test, opened with `?scene=camp3d` on the web build: the camp painting on the ground and the barracks as 3D
## blocks (art/camp/models/barracks.glb, from tools/blender/camp_barracks.py), with the painting projected onto both from the
## camera it was painted from. At rest it looks like the painting; turning the camera shows the depth. The shot is set by URL
## parameters, because the preview pane runs a Godot page at about one frame a second:
## orbit=<deg> turns the camera around the barracks, pitch=<deg> tilts it further down, walker=<0..1> places a porter on a path
## behind the barracks (-1 hides it), zoom=<n> magnifies, tint=1 washes the blocks red to check them against the painting.

const PAINTING := "res://art/camp/algeria_camp.webp"
const GROUND := "res://art/camp/dev/ground_no_barracks.webp"
const MODEL := "res://art/camp/models/barracks.glb"
const PROJECTION := preload("res://shaders/camp_projection.gdshader")
const WALKER_ART := "res://art/camp/life/pack_a.png"

## The painting's camera, measured on the barracks' walls. A ground edge at angle φ to the screen's x axis shows with slope
## tan φ · sin(elevation); the gable end shows 0.42 and the long side 0.6, so the elevation is 30° and the walls lie 40° and 50°
## off the screen's x axis (the camera's 45° plus a turn of the barracks).
const ELEVATION := 30.0
const YAW := 45.0
## The painting in px; one 3D unit is one px (CampLayout.WORLD is half this).
const SIZE := Vector2(1536.0, 2752.0)
## The barracks' front bottom corner in painting px, its turn about the vertical, and the point the camera orbits.
const BARRACKS_CORNER := Vector2(412.0, 960.0)
const BARRACKS_TURN := 5.0
const PIVOT := Vector2(430.0, 850.0)
## Where the porter's feet go, in painting px: a line behind the barracks.
const WALK_FROM := Vector2(230.0, 830.0)
const WALK_TO := Vector2(720.0, 830.0)
## 3D units per figure texture px: CampLife's figure scale, in painting px.
const FIGURE_PX := 0.92
const DISTANCE := 4000.0
const NEAR := 1.0
const FAR := 20000.0
const GROUND_SIZE := 20000.0

var _rest := Transform3D()

func _ready() -> void:
	_rest = _camera_transform(Vector3.ZERO, YAW, ELEVATION)
	var rest_vp := Projection.create_orthogonal(-SIZE.x / 2, SIZE.x / 2, -SIZE.y / 2, SIZE.y / 2, NEAR, FAR) \
		* Projection(_rest.affine_inverse())
	var tint := _param("tint", 0.0)
	_add_ground(_material(GROUND, rest_vp, 0.0))
	_add_barracks(_material(PAINTING, rest_vp, tint * 0.45))
	var walker := _param("walker", 0.5)
	if walker >= 0.0:
		_add_walker(WALK_FROM.lerp(WALK_TO, walker))
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = SIZE.y / _param("zoom", 2.5)
	camera.near = NEAR
	camera.far = FAR
	camera.transform = _camera_transform(ground_at(PIVOT), YAW + _param("orbit", 0.0), ELEVATION + _param("pitch", 0.0))
	add_child(camera)
	camera.make_current()

## Looking at `target` from `yaw` degrees round and `elevation` degrees up, DISTANCE away.
static func _camera_transform(target: Vector3, yaw: float, elevation: float) -> Transform3D:
	var basis := Basis.from_euler(Vector3(deg_to_rad(-elevation), deg_to_rad(yaw), 0.0))
	return Transform3D(basis, target + basis.z * DISTANCE)

## The point on the ground (y = 0) that shows at `px` of the painting from the rest camera.
func ground_at(px: Vector2) -> Vector3:
	var from := _rest.origin + _rest.basis.x * (px.x - SIZE.x / 2) + _rest.basis.y * (SIZE.y / 2 - px.y)
	var dir := -_rest.basis.z
	return from + dir * (-from.y / dir.y)

func _material(texture: String, rest_vp: Projection, tint: float) -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.shader = PROJECTION
	mat.set_shader_parameter("painting", load(texture))
	mat.set_shader_parameter("rest_view_projection", rest_vp)
	mat.set_shader_parameter("tint", tint)
	return mat

func _add_ground(mat: ShaderMaterial) -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(GROUND_SIZE, GROUND_SIZE)
	var ground := MeshInstance3D.new()
	ground.mesh = plane
	ground.material_override = mat
	add_child(ground)

func _add_barracks(mat: ShaderMaterial) -> void:
	var model: Node3D = (load(MODEL) as PackedScene).instantiate()
	model.position = ground_at(BARRACKS_CORNER)
	model.rotation.y = deg_to_rad(BARRACKS_TURN)
	add_child(model)
	for mesh: Node in model.find_children("*", "MeshInstance3D", true, false):
		(mesh as MeshInstance3D).material_override = mat

func _add_walker(feet: Vector2) -> void:
	var sprite := Sprite3D.new()
	sprite.texture = load(WALKER_ART)
	sprite.pixel_size = FIGURE_PX
	sprite.offset = Vector2(0.0, sprite.texture.get_height() / 2.0)
	sprite.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	sprite.shaded = false
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sprite.position = ground_at(feet)
	add_child(sprite)

static func _param(name: String, fallback: float) -> float:
	var v := UrlParam.value(name)
	return v.to_float() if v.is_valid_float() else fallback
