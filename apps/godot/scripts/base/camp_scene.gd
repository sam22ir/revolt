class_name CampScene
extends SubViewport
## The base screen's picture in 3D: the camp painting on the ground, the six buildings as blocks with the painting projected onto
## them (CampModels), and the people and mules as upright figures among them, all seen from the camera the painting was painted
## from. At rest that is the painting itself, so BaseView draws this viewport's texture where the painting was and its traced tap
## outlines and name plates still fit; what 3D adds is that a building hides whoever walks behind it. Figures follow
## CampLife.figures, which is worked out from the time the caller gives, so nothing here ticks on its own.

## 3D units (painting px) per figure texture px: CampLife's scale in world units, times two painting px per world unit.
const FIGURE_PX := CampLife.FIGURE_SCALE * 2.0
## An upright figure seen from 30° up shows cos 30° of its height; stretching it by the inverse keeps the 2D figures' size.
const UPRIGHT := 1.0 / 0.8660254
## The painting's aspect, 1536:2752 = 24:43. The render size is always a whole multiple of it, so the picture is never stretched.
const ASPECT := Vector2i(24, 43)
const SHADOW_LIFT := 1.0

var _camera := Camera3D.new()
var _figures: Array[Sprite3D] = []
var _shadows: Array[Sprite3D] = []
var _textures := {}

func _init() -> void:
	own_world_3d = true
	transparent_bg = false
	render_target_update_mode = SubViewport.UPDATE_ALWAYS
	set_render_size(CampLayout.WORLD)

## Loads the ground, the buildings and the figures. Called once.
func build() -> void:
	var painting := CampModels.material(CampModels.PAINTING)
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	# Far bigger than the painting, so its edges never show; the painting clamps to its own edge colour beyond them.
	plane.size = Vector2(20000.0, 20000.0)
	ground.mesh = plane
	ground.material_override = painting
	add_child(ground)
	for id: String in CampModels.PLACES:
		add_child(CampModels.building(id, painting))
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.keep_aspect = Camera3D.KEEP_HEIGHT
	_camera.size = CampModels.SIZE.y
	_camera.near = CampModels.NEAR
	_camera.far = CampModels.FAR
	_camera.transform = CampModels.rest()
	add_child(_camera)
	for kind: String in CampLife.FRAMES:
		var frames: Array[Texture2D] = []
		for piece: String in CampLife.FRAMES[kind]:
			frames.append(load(CampLife.ART + piece + ".png"))
		_textures[kind] = frames
	var shadow := _shadow_texture()
	for i in CampLife.figures(0).size():
		_figures.append(_figure())
		_shadows.append(_shadow(shadow))

## Renders at `size` px or the nearest smaller whole multiple of the painting's aspect, at least one step and at most the
## painting's own size.
func set_render_size(want: Vector2) -> void:
	var steps := clampi(floori(minf(want.x / ASPECT.x, want.y / ASPECT.y)), 1, int(CampModels.SIZE.x) / ASPECT.x)
	size = ASPECT * steps

## Moves everyone to where they are at `now_ms`.
func tick(now_ms: int) -> void:
	var list := CampLife.figures(now_ms)
	for i in mini(list.size(), _figures.size()):
		var f: Dictionary = list[i]
		var feet := CampModels.ground_at(f["at"] * 2.0)
		var sprite := _figures[i]
		var tex: Texture2D = _textures[f["kind"]][f["frame"]]
		sprite.texture = tex
		sprite.flip_h = f["left"]
		sprite.offset = Vector2(0.0, tex.get_height() / 2.0 + float(f["lift"]) * 2.0 / FIGURE_PX)
		sprite.position = feet
		_shadows[i].position = feet + Vector3(0.0, SHADOW_LIFT, 0.0)
		_shadows[i].scale = Vector3.ONE * tex.get_width() / float(CampLife.PUFF_SIZE) * 0.84

## Where figure `i` stands, in painting px (for tests and tooling).
func figure_px(i: int) -> Vector2:
	return CampModels.painting_px(_figures[i].position)

func figure_count() -> int:
	return _figures.size()

func _figure() -> Sprite3D:
	var sprite := Sprite3D.new()
	sprite.pixel_size = FIGURE_PX
	sprite.scale = Vector3(1.0, UPRIGHT, 1.0)
	sprite.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	sprite.shaded = false
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR
	add_child(sprite)
	return sprite

## A soft dark disc flat on the ground under the feet, so the figure stands on the painted ground.
func _shadow(tex: Texture2D) -> Sprite3D:
	var sprite := Sprite3D.new()
	sprite.texture = tex
	sprite.pixel_size = FIGURE_PX
	sprite.rotation.x = -PI / 2.0
	sprite.shaded = false
	sprite.modulate = CampLife.GROUND_SHADOW
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISABLED
	add_child(sprite)
	return sprite

func _shadow_texture() -> GradientTexture2D:
	var fade := Gradient.new()
	fade.set_color(0, Color.WHITE)
	fade.set_color(1, Color(1, 1, 1, 0))
	var tex := GradientTexture2D.new()
	tex.gradient = fade
	tex.width = CampLife.PUFF_SIZE
	tex.height = CampLife.PUFF_SIZE
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	return tex
