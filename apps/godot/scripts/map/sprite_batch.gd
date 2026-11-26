class_name SpriteBatch
extends MultiMeshInstance2D
## Many sprites from one atlas in a single draw call (MultiMesh with a unit quad). Each sprite is placed so that the
## point (anchor_x, anchor_y) of its frame lands on `pos`, scaled by `scale` world px per atlas px, optionally mirrored
## about its own vertical axis (the anchor mirrors with it, like SpritePool in the Phaser client).
## Sprites are drawn in the order given: sort them before calling set_sprites for painter's order.

static var _quad: ArrayMesh
static var _shader: Shader

var _atlas: Dictionary

func _init(atlas: Dictionary) -> void:
	_atlas = atlas
	texture = atlas["texture"]
	if _shader == null:
		_shader = load("res://shaders/sprite_batch.gdshader") as Shader
	var mat := ShaderMaterial.new()
	mat.shader = _shader
	material = mat

## A unit quad (0,0)-(1,1) with matching UVs. Built by hand: QuadMesh is a 3D primitive and renders flipped in 2D.
static func _unit_quad() -> ArrayMesh:
	if _quad == null:
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = PackedVector2Array([Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)])
		arrays[Mesh.ARRAY_TEX_UV] = PackedVector2Array([Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)])
		arrays[Mesh.ARRAY_INDEX] = PackedInt32Array([0, 1, 2, 0, 2, 3])
		_quad = ArrayMesh.new()
		_quad.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return _quad

## Where one sprite goes: the instance transform (unit quad -> world), the atlas rectangle (u0, v0, du, dv) as custom data,
## and the colour (alpha). `s` is {frame, pos, scale, flip, alpha, center (optional)}; `frame` is the frame dictionary.
static func placement(frame: Dictionary, s: Dictionary, atlas_size: Vector2) -> Dictionary:
	var w := float(frame["w"])
	var h := float(frame["h"])
	var scale := float(s["scale"])
	var center: bool = s.get("center", false)
	var ax := w * 0.5 if center else float(frame.get("ax", w * 0.5))
	var ay := h * 0.5 if center else float(frame.get("ay", h))
	var flip: bool = s["flip"]
	var pos: Vector2 = s["pos"]
	var anchor_x := (w - ax) if flip else ax
	var left := pos.x - anchor_x * scale
	var top := pos.y - ay * scale
	var t := Transform2D()
	if flip:
		t.x = Vector2(-w * scale, 0.0)
		t.origin = Vector2(left + w * scale, top)
	else:
		t.x = Vector2(w * scale, 0.0)
		t.origin = Vector2(left, top)
	t.y = Vector2(0.0, h * scale)
	return {
		"transform": t,
		"custom": Color(float(frame["x"]) / atlas_size.x, float(frame["y"]) / atlas_size.y, w / atlas_size.x, h / atlas_size.y),
		"color": Color(1, 1, 1, float(s["alpha"])),
	}

## Sets one sprite's opacity (0 hides it) without rebuilding the batch.
func set_alpha(i: int, alpha: float) -> void:
	# Sprites are never tinted (placement's colour is white), and a headless renderer cannot read colours back.
	multimesh.set_instance_color(i, Color(1, 1, 1, alpha))

## An empty batch for `count` sprites, to fill a part at a time (fill) before it is shown.
func begin(count: int) -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_2D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = _unit_quad()
	mm.instance_count = count
	multimesh = mm

## Places sprites[from..to-1] in the batch begun for them.
func fill(sprites: Array, from: int, to: int) -> void:
	var atlas_size: Vector2 = _atlas["size"]
	var frames: Array = _atlas["frames"]
	for i in range(from, mini(to, sprites.size())):
		var s: Dictionary = sprites[i]
		var pl := placement(frames[clampi(int(s["frame"]), 0, frames.size() - 1)], s, atlas_size)
		multimesh.set_instance_transform_2d(i, pl["transform"])
		multimesh.set_instance_color(i, pl["color"])
		multimesh.set_instance_custom_data(i, pl["custom"])

## `sprites`: Array of {frame: int, pos: Vector2, scale: float, flip: bool, alpha: float, center: bool (optional)}.
## `center` anchors the frame's middle instead of its manifest ground anchor (used for decals).
func set_sprites(sprites: Array) -> void:
	var mm := MultiMesh.new()
	# Formats first, then the count (changing them afterwards is not allowed).
	mm.transform_format = MultiMesh.TRANSFORM_2D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = _unit_quad()
	mm.instance_count = sprites.size()
	var atlas_size: Vector2 = _atlas["size"]
	var frames: Array = _atlas["frames"]
	for i in sprites.size():
		var s: Dictionary = sprites[i]
		var pl := placement(frames[clampi(int(s["frame"]), 0, frames.size() - 1)], s, atlas_size)
		mm.set_instance_transform_2d(i, pl["transform"])
		mm.set_instance_color(i, pl["color"])
		mm.set_instance_custom_data(i, pl["custom"])
	multimesh = mm
