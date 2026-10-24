extends SceneTree
## Bakes the two seed-independent ground textures to PNG (art/ground). Run after changing GroundGrain, then commit the PNGs:
##   godot --headless --path apps/godot -s tools/bake_ground_grain.gd
## test_ground_grain.gd fails when a PNG no longer matches the generator, so a change to one must be baked.

func _init() -> void:
	var grain := GroundGrain.green_grain()
	var detail := GroundGrain.detail_texture()
	assert(grain.save_png(GroundGrain.GRAIN_PATH) == OK)
	assert(detail.save_png(GroundGrain.DETAIL_PATH) == OK)
	print("baked ", GroundGrain.GRAIN_PATH, " and ", GroundGrain.DETAIL_PATH)
	quit()
