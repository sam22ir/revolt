class_name CampModels
extends RefCounted
## The camp's buildings as 3D blocks (art/camp/models/<id>.glb, from tools/blender/camp_buildings.py) with the painting projected
## onto them from the camera it was painted from (shaders/camp_projection.gdshader): at rest they look exactly like the painting,
## and they show their depth when the camera turns or something passes behind them. One 3D unit is one painting px; the ground
## is the plane y = 0.

const PAINTING := CampLayout.PAINTING
## The painting with the buildings smudged out, for the ground under them when the camera turns: only the look test
## (scripts/dev/camp_3d_test.gd) does; the base screen never turns, so it keeps the painting itself (tools/camp_fill_buildings.py).
const GROUND := "res://art/camp/dev/ground_no_buildings.webp"
const MODELS := "res://art/camp/models/"
const PROJECTION := preload("res://shaders/camp_projection.gdshader")

## The painting's camera, measured on the barracks' walls. A ground edge at angle φ to the screen's x axis shows with slope
## tan φ · sin(elevation); the barracks' gable end shows 0.42 and its long side 0.6, so the elevation is 30° and the walls lie
## 40° and 50° off the screen's x axis (the camera's 45° plus a turn of the building).
const ELEVATION := 30.0
const YAW := 45.0
## The painting in px (CampLayout.WORLD is half this).
const SIZE := Vector2(1536.0, 2752.0)
const DISTANCE := 4000.0
const NEAR := 1.0
const FAR := 20000.0

## Each building's front bottom corner in painting px and its turn about the vertical (degrees), measured on the painting the
## same way: a positive turn makes the right-hand face steeper on screen and the left-hand face flatter.
const PLACES := {
	"hq": {"corner": Vector2(695.0, 332.0), "turn": -10.0},
	"barracks": {"corner": Vector2(412.0, 960.0), "turn": 5.0},
	"armory": {"corner": Vector2(1180.0, 965.0), "turn": 3.0},
	"hero_hall": {"corner": Vector2(250.0, 1590.0), "turn": 0.0},
	"treasury": {"corner": Vector2(1325.0, 1570.0), "turn": 0.0},
	"farm": {"corner": Vector2(1093.0, 1945.0), "turn": 3.0},
}

## Looking at `target` from `yaw` degrees round and `elevation` degrees up, DISTANCE away.
static func camera_transform(target: Vector3, yaw: float, elevation: float) -> Transform3D:
	var basis := Basis.from_euler(Vector3(deg_to_rad(-elevation), deg_to_rad(yaw), 0.0))
	return Transform3D(basis, target + basis.z * DISTANCE)

## The camera the painting was painted from, looking at the painting's centre.
static func rest() -> Transform3D:
	return camera_transform(Vector3.ZERO, YAW, ELEVATION)

static func rest_view_projection() -> Projection:
	return Projection.create_orthogonal(-SIZE.x / 2, SIZE.x / 2, -SIZE.y / 2, SIZE.y / 2, NEAR, FAR) * Projection(rest().affine_inverse())

## The point on the ground (y = 0) that shows at `px` of the painting from the rest camera.
static func ground_at(px: Vector2) -> Vector3:
	var cam := rest()
	var from := cam.origin + cam.basis.x * (px.x - SIZE.x / 2) + cam.basis.y * (SIZE.y / 2 - px.y)
	var dir := -cam.basis.z
	return from + dir * (-from.y / dir.y)

## Where `point` shows on the painting, in px.
static func painting_px(point: Vector3) -> Vector2:
	var local := rest().affine_inverse() * point
	return Vector2(local.x + SIZE.x / 2, SIZE.y / 2 - local.y)

## The projection material for `texture`; `tint` washes it red, to check blocks against the painting.
static func material(texture: String, tint: float = 0.0) -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.shader = PROJECTION
	mat.set_shader_parameter("painting", load(texture))
	mat.set_shader_parameter("rest_view_projection", rest_view_projection())
	mat.set_shader_parameter("tint", tint)
	return mat

## The building `id`, placed and turned, with `mat` on every mesh.
static func building(id: String, mat: Material) -> Node3D:
	var model: Node3D = (load(MODELS + id + ".glb") as PackedScene).instantiate()
	model.name = id
	model.position = ground_at(PLACES[id]["corner"])
	model.rotation.y = deg_to_rad(PLACES[id]["turn"])
	for mesh: Node in model.find_children("*", "MeshInstance3D", true, false):
		(mesh as MeshInstance3D).material_override = mat
	return model

## The triangles of building `id` as they show on the painting, in px: a flat list, three points a triangle.
static func silhouette(id: String) -> PackedVector2Array:
	var model := building(id, null)
	var out := PackedVector2Array()
	for node: Node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh_node := node as MeshInstance3D
		var xf := model.transform * _relative(mesh_node, model)
		for s in mesh_node.mesh.get_surface_count():
			var arrays := mesh_node.mesh.surface_get_arrays(s)
			var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var index: Variant = arrays[Mesh.ARRAY_INDEX]
			var order: PackedInt32Array = index if index != null else PackedInt32Array(range(verts.size()))
			for i in order:
				out.append(painting_px(xf * verts[i]))
	model.free()
	return out

## `node`'s transform relative to its ancestor `top`.
static func _relative(node: Node3D, top: Node3D) -> Transform3D:
	var xf := Transform3D.IDENTITY
	var at: Node = node
	while at != top and at is Node3D:
		xf = (at as Node3D).transform * xf
		at = at.get_parent()
	return xf
