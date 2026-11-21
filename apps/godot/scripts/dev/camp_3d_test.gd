class_name Camp3dTest
extends Node3D
## Dev-only look test, opened with `?scene=camp3d` on the web build: the camp painting on the ground and its six buildings as 3D
## blocks with the painting projected onto them (CampModels). At rest it looks like the painting; turning the camera shows the
## depth. The shot is set by URL parameters, because the preview pane runs a Godot page at about one frame a second:
## focus=<building id> centres on one building (default: the whole camp), orbit=<deg> turns the camera round that centre,
## pitch=<deg> tilts it further down, zoom=<n> magnifies (default 1, or 2.5 with a focus), walker=<0..1> places a porter on a
## path behind the barracks (-1 hides it, the default), tint=1 washes the blocks red to check them against the painting.

const WALKER_ART := "res://art/camp/life/pack_a.png"
## Where the porter's feet go, in painting px: a line behind the barracks.
const WALK_FROM := Vector2(230.0, 830.0)
const WALK_TO := Vector2(720.0, 830.0)
## 3D units per figure texture px: CampLife's figure scale, in painting px.
const FIGURE_PX := 0.92
const GROUND_SIZE := 20000.0

func _ready() -> void:
	_add_ground()
	var mat := CampModels.material(CampModels.PAINTING, _param("tint", 0.0) * 0.45)
	for id: String in CampModels.PLACES:
		add_child(CampModels.building(id, mat))
	var walker := _param("walker", -1.0)
	if walker >= 0.0:
		_add_walker(WALK_FROM.lerp(WALK_TO, walker))
	var focus := UrlParam.value("focus")
	var centre: Vector2 = CampModels.PLACES[focus]["corner"] if CampModels.PLACES.has(focus) else CampModels.SIZE / 2
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = CampModels.SIZE.y / _param("zoom", 2.5 if CampModels.PLACES.has(focus) else 1.0)
	camera.near = CampModels.NEAR
	camera.far = CampModels.FAR
	camera.transform = CampModels.camera_transform(CampModels.ground_at(centre), CampModels.YAW + _param("orbit", 0.0),
		CampModels.ELEVATION + _param("pitch", 0.0))
	add_child(camera)
	camera.make_current()

func _add_ground() -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(GROUND_SIZE, GROUND_SIZE)
	var ground := MeshInstance3D.new()
	ground.mesh = plane
	ground.material_override = CampModels.material(CampModels.GROUND)
	add_child(ground)

func _add_walker(feet: Vector2) -> void:
	var sprite := Sprite3D.new()
	sprite.texture = load(WALKER_ART)
	sprite.pixel_size = FIGURE_PX
	sprite.offset = Vector2(0.0, sprite.texture.get_height() / 2.0)
	sprite.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	sprite.shaded = false
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sprite.position = CampModels.ground_at(feet)
	add_child(sprite)

static func _param(name: String, fallback: float) -> float:
	var v := UrlParam.value(name)
	return v.to_float() if v.is_valid_float() else fallback
