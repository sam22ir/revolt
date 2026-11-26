extends SceneTree
## The camp as the game draws it today (BaseView, 2D pictures), for comparing with tools/camp3d_shot.gd. Needs a display:
##   godot --path . -s tools/camp2d_shot.gd -- <out.png> [zoom 1 to CampLayout.MAX_ZOOM] [world x,y to zoom about] [w] [h]
## Prints the painting px at the middle of the picture (to centre the 3D shot on), saves it, then times 120 frames.

const LEVELS := {"hq": 1, "farm": 1, "armory": 1, "treasury": 1, "barracks": 1, "hero_hall": 1}
const NOW := 1_793_800_000_000

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var out := args[0]
	var zoom := float(args[1]) if args.size() > 1 else 1.0
	var size := Vector2i(int(args[3]) if args.size() > 3 else 720, int(args[4]) if args.size() > 4 else 1290)
	root.size = size
	var view := SubViewport.new()
	view.size = size
	view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(view)
	var layer := CanvasLayer.new()
	view.add_child(layer)
	var base := BaseView.new()
	base.layer = layer
	layer.add_child(base)
	base.build()
	base.apply_fit(Vector2(size), 0.0, 0.0)
	base.set_state(LEVELS, null, NOW)
	if zoom > 1.0:
		var about := Vector2(size) / 2.0
		if args.size() > 2 and args[2] != "-":
			var xy := args[2].split(",")
			about = layer.offset + Vector2(float(xy[0]), float(xy[1])) * layer.scale
		base.zoom_about(zoom, about)
	var middle := (Vector2(size) / 2.0 - layer.offset) / layer.scale * 2.0
	print("MIDDLE painting px %d,%d" % [roundi(middle.x), roundi(middle.y)])
	for i in 4:
		await process_frame
	await RenderingServer.frame_post_draw
	view.get_texture().get_image().save_png(out)
	print("SAVED %s" % out)
	var total := 0
	var worst := 0
	for i in 120:
		var t := Time.get_ticks_usec()
		base.set_state(LEVELS, null, NOW + i * 16)
		await RenderingServer.frame_post_draw
		var d := Time.get_ticks_usec() - t
		total += d
		worst = maxi(worst, d)
	print("FRAMES avg %.1f ms, worst %.1f ms" % [total / 120000.0, worst / 1000.0])
	quit()
