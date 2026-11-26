extends SceneTree
## Times a windowed 192-tile map build with the landmarks given as the server sends them, then the first window and the background fill:
##   godot --headless -s tools/profile_windowed.gd -- [size]

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var size := int(args[0]) if args.size() > 0 else 192
	var seed := 1954
	var cell := int(Balance.data()["map"]["regionCell"])
	var grid := MapGrid.compute(seed, size, cell)
	var geo := Geography.build(seed, size, cell, grid["terrain"], grid["regions"])
	var flat := func(path: Array) -> Array:
		var out: Array = []
		for t: Vector2i in path:
			out.append_array([t.x, t.y])
		return out
	var wire := {"wadis": geo["wadis"].map(flat), "roads": geo["roads"].map(flat), "oases": flat.call(geo["oases"])}
	var map := WorldMap.new()
	map.windowed = true
	root.add_child(map)
	await process_frame
	var t := Time.get_ticks_msec()
	await map.build({"size": size, "terrainSeed": seed, "now": 0, "liberations": [], "marches": [], "sites": [], "hqs": [], "npcs": [],
		"bases": [{"x": size / 2, "y": size / 2, "tag": "ME", "mine": true, "alliance": null}], "geography": wire})
	print("BUILD %d ms %s" % [Time.get_ticks_msec() - t, map.build_times])
	t = Time.get_ticks_msec()
	var centre := Iso.tile_to_world(size / 2, size / 2)
	map.set_view(Rect2(centre - Vector2(470, 835), Vector2(940, 1670)), 0.4)
	print("WINDOW %d ms, %d chunks" % [Time.get_ticks_msec() - t, map.loaded_chunks()])
	var frames := 0
	var worst := 0
	while map.is_filling_ground() or map.prop_layer().is_filling():
		var f := Time.get_ticks_msec()
		await process_frame
		worst = maxi(worst, Time.get_ticks_msec() - f)
		frames += 1
	print("FILLED in %d frames, %d ms; worst frame %d ms" % [frames, Time.get_ticks_msec() - t, worst])
	quit()
