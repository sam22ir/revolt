class_name GroundLayer
extends Node2D
## The ground, in the bake order of ground-bake.ts: colour field and green wash, decals, features (wadis, roads, oases), then
## the mask and rim around the map's top face, then the fine detail overlay. Props, region seams and objects are separate
## layers above (see WorldMap).

var _base := GroundBase.new()
var _decals: SpriteBatch
var _features := FeaturePainter.new()
var _frame := GroundFrame.new()
var _detail := GroundDetail.new()

func _ready() -> void:
	add_child(_base)

## `plan` is GroundPlan.build()'s result; `wadi_paths` and `road_paths` come from FeatureShape; `oases` are Vector2i tiles.
func build(size: int, plan: Dictionary, fertility: PackedFloat32Array, wadi_paths: Array, road_paths: Array, oases: Array, art: GroundArt) -> void:
	_base.setup(size, plan["colours"], fertility)
	if _decals != null:
		_decals.queue_free()
	_decals = SpriteBatch.new(art.atlases["decals"])
	add_child(_decals)
	var decal_frames: Array = art.atlases["decals"]["frames"]
	var sprites: Array = []
	for d: Dictionary in plan["decals"]:
		var frame_w := float(decal_frames[int(d["frame"])]["w"])
		sprites.append({
			"frame": d["frame"],
			"pos": Iso.tile_to_world(float(d["x"]), float(d["y"])),
			"scale": float(d["scale"]) * Iso.TILE_W / frame_w,
			"flip": d["flip"],
			"alpha": float(d["alpha"]),
			"center": true,
		})
	_decals.set_sprites(sprites)
	if _features.get_parent() == null:
		add_child(_features)
		add_child(_frame)
		add_child(_detail)
	_features.setup(wadi_paths, road_paths, oases)
	_frame.setup(size)
	_detail.setup(size)

## Fades the detail overlay with the camera zoom (see GroundDetail.alpha_at).
func set_view_zoom(view_zoom: float) -> void:
	_detail.set_zoom(view_zoom)

## Shows or hides a part of the ground, for visual debugging ("decals", "features", "wash", "detail").
func set_part_visible(part: String, visible_now: bool) -> void:
	match part:
		"detail":
			_detail.set_part_visible(visible_now)
		"decals":
			if _decals != null:
				_decals.visible = visible_now
		"features":
			_features.visible = visible_now
		"wash":
			_base.wash_visible = visible_now
			_base.queue_redraw()

func decal_count() -> int:
	return 0 if _decals == null or _decals.multimesh == null else _decals.multimesh.instance_count
