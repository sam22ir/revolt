extends SceneTree
## Saves a picture of the world map with a made-up snapshot, for looking at the ground while working on it. Needs a display:
##   godot --path . -s tools/map_shot.gd -- <out.png> <tile x> <tile y> [view zoom] [seed] [width] [height] [march: out|clash|smoke|-] [map size]
## With a march, the player's column of 80 troops goes from the test base to the post 9 tiles east, shown on the way out, at the
## fight, or walking home after a win.
## The zoom is the map camera's: a tile is 96 x zoom px wide.

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var out := args[0]
	var tile := Vector2(float(args[1]), float(args[2]))
	var zoom := float(args[3]) if args.size() > 3 else 1.0
	var seed := int(args[4]) if args.size() > 4 else 1954
	var size := Vector2i(int(args[5]) if args.size() > 5 else 1000, int(args[6]) if args.size() > 6 else 1000)
	var scene := args[7] if args.size() > 7 and args[7] != "-" else ""
	var map_size := int(args[8]) if args.size() > 8 else 64
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
	var base := Vector2i(int(tile.x), int(tile.y))
	var post := base + Vector2i(9, 3)
	var marches: Array = []
	if scene != "":
		marches = [{"id": "m1", "mine": true, "from": {"x": base.x, "y": base.y}, "to": {"x": post.x, "y": post.y}, "departAt": 0, "arriveAt": 100000, "returnAt": 200000}]
	await map.build({
		"size": map_size, "terrainSeed": seed, "now": 0, "liberations": [], "marches": marches, "sites": [], "hqs": [],
		"bases": [{"x": base.x, "y": base.y, "tag": "TEST", "mine": true, "alliance": null}],
		"npcs": [{"id": "a", "x": post.x, "y": post.y, "kind": "outpost", "level": 3}],
	})
	if scene != "":
		var now: float = {"out": 55000.0, "clash": 101300.0, "smoke": 118000.0}[scene]
		map.markers().set_own([{"id": "m1", "troops": {"infantry": 80}, "outcome": {"result": "victory"} if scene == "smoke" else null}])
		map.markers().tick(now, zoom)
	print("BUILD ", Time.get_ticks_msec() - t, " ms")
	map.set_view_zoom(maxf(zoom, 0.1))
	for i in 4:
		await process_frame
	await RenderingServer.frame_post_draw
	view.get_texture().get_image().save_png(out)
	print("SAVED ", out)
	quit()
