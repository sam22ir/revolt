extends SceneTree
## Lists map spots worth a look while working on the ground: road or riverbed tiles on mountains, and plain tiles just below one.
##   godot --headless --path . -s tools/map_spots.gd -- <seed>

func _initialize() -> void:
	var seed := int(OS.get_cmdline_user_args()[0])
	var size := 64
	var region_cell := int(Balance.data()["map"]["regionCell"])
	var grid := MapGrid.compute(seed, size, region_cell)
	var geo := Geography.build(seed, size, region_cell, grid["terrain"], grid["regions"])
	var terrain: PackedInt32Array = grid["terrain"]
	var flags: PackedByteArray = geo["flags"]
	var crossing := []
	var below := []
	for y in size:
		for x in size:
			var i := y * size + x
			if terrain[i] == GroundPlan.T_MOUNTAIN and (flags[i] & (Geography.GEO_ROAD | Geography.GEO_WADI)) != 0:
				crossing.append(Vector2i(x, y))
			if terrain[i] != GroundPlan.T_MOUNTAIN and x >= 2 and y >= 2 and terrain[(y - 1) * size + x - 1] == GroundPlan.T_MOUNTAIN:
				below.append(Vector2i(x, y))
	print("CROSSING ", crossing.slice(0, 6))
	print("BELOW ", below.slice(0, 6))
	quit()
