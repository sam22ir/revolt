extends SceneTree
## Times each stage of a world map build at a given size, without drawing:
##   godot --headless -s tools/profile_map.gd -- <size> [seed]

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var size := int(args[0])
	var seed := int(args[1]) if args.size() > 1 else 1954
	var cell := int(Balance.data()["map"]["regionCell"])
	# A one-element array, since a lambda captures plain locals by value.
	var t := [Time.get_ticks_msec()]
	var lap := func(name: String) -> void:
		print("%-14s %6d ms" % [name, Time.get_ticks_msec() - t[0]])
		t[0] = Time.get_ticks_msec()
	var art := GroundArt.load_art()
	lap.call("art")
	var grid := MapGrid.compute(seed, size, cell)
	lap.call("grid")
	var geo := Geography.build(seed, size, cell, grid["terrain"], grid["regions"])
	lap.call("geography")
	var flags := Geography.with_oasis_front(geo["flags"], geo["oases"], size)
	lap.call("oasis front")
	var route := RoutePath.grid_for(size, grid["terrain"], flags)
	lap.call("route grid")
	var fertility := GroundMath.fertility_grid(seed, size)
	var rocks := GroundMath.cluster_mask(seed, size, "rocks")
	var grove := GroundMath.cluster_mask(seed, size, "grove")
	lap.call("fields")
	var plan := GroundPlan.build(seed, size, grid["terrain"], flags, fertility, rocks, grove, art.decal_frames_by_kind(), true)
	lap.call("ground plan")
	var land := GroundField.land(size, grid["height"], grid["terrain"], fertility, rocks, grove, flags)
	lap.call("land field")
	var features := GroundField.features(size, FeatureShape.wadi_paths(geo["wadis"]), FeatureShape.road_paths(geo["roads"]), geo["oases"])
	lap.call("feature field")
	var layer := PropLayer.new()
	root.add_child(layer)
	layer.build(size, plan["props"], art, {})
	lap.call("prop layer")
	layer.set_occupied({100: true, 5000: true, 9000: true})
	lap.call("prop hide")
	print("props ", plan["props"].size(), " decals ", plan["decals"].size(), " roads ", geo["roads"].size(), " land ", land.get_size(), " route ", route.region)
	quit()
