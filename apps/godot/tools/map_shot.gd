extends SceneTree
## Saves a picture of the world map with a made-up snapshot, for looking at the ground while working on it. Needs a display:
##   godot --path . -s tools/map_shot.gd -- <out.png> <tile x> <tile y> [view zoom] [seed] [width] [height]
## The zoom is the map camera's: a tile is 96 x zoom px wide.

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var out := args[0]
	var tile := Vector2(float(args[1]), float(args[2]))
	var zoom := float(args[3]) if args.size() > 3 else 1.0
	var seed := int(args[4]) if args.size() > 4 else 1954
	var size := Vector2i(int(args[5]) if args.size() > 5 else 1000, int(args[6]) if args.size() > 6 else 1000)
	root.size = size
	var view := SubViewport.new()
	view.size = size
	view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(view)
	RenderingServer.set_default_clear_color(Color("1d120a"))
	var map := WorldMap.new()
	view.add_child(map)
	var camera := Camera2D.new()
	camera.position = Iso.tile_to_world(tile.x, tile.y)
	camera.zoom = Vector2(zoom, zoom)
	view.add_child(camera)
	await process_frame
	camera.make_current()
	var t := Time.get_ticks_msec()
	await map.build({
		"size": 64, "terrainSeed": seed, "now": 0, "liberations": [], "marches": [], "sites": [], "hqs": [],
		"bases": [{"x": int(tile.x), "y": int(tile.y), "tag": "TEST", "mine": true, "alliance": null}],
		"npcs": [{"id": "a", "x": int(tile.x) + 4, "y": int(tile.y) - 2, "kind": "outpost", "level": 3}],
	})
	print("BUILD ", Time.get_ticks_msec() - t, " ms")
	map.set_view_zoom(maxf(zoom, 0.1))
	for i in 4:
		await process_frame
	await RenderingServer.frame_post_draw
	view.get_texture().get_image().save_png(out)
	print("SAVED ", out)
	quit()
