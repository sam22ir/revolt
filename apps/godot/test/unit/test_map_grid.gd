extends GutTest
## The fast whole-map computation must equal the golden grids from the real rules, tile for tile.

func test_matches_the_golden_grids_for_every_seed() -> void:
	var fx: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/map-fixtures.json"))
	var size := int(fx["size"])
	var region_cell := int(Balance.data()["map"]["regionCell"])
	for s: Dictionary in fx["seeds"]:
		var grid := MapGrid.compute(int(s["seed"]), size, region_cell)
		var terrain: PackedInt32Array = grid["terrain"]
		var regions: PackedInt32Array = grid["regions"]
		var bad_terrain := 0
		var bad_regions := 0
		for y in size:
			var trow: String = s["terrain"][y]
			var rrow: String = s["regions"][y]
			for x in size:
				if MapGrid.TERRAIN_IDS[terrain[y * size + x]] != MapMath.TERRAIN_BY_LETTER[trow[x]]:
					bad_terrain += 1
				if regions[y * size + x] != rrow[x].hex_to_int():
					bad_regions += 1
		assert_eq(bad_terrain, 0, "terrain mismatches, seed %s" % s["seed"])
		assert_eq(bad_regions, 0, "region mismatches, seed %s" % s["seed"])

func test_terrain_ids_match_the_reference_port() -> void:
	for id in MapGrid.TERRAIN_IDS:
		assert_true(MapMath.TERRAIN_BY_LETTER.values().has(id), id)

func test_noise_field_equals_value_noise_tile_by_tile() -> void:
	# Cells that divide the map and one that does not (7), at the map size and a size the cells do not divide.
	for size: int in [192, 50]:
		for cell: int in [3, 6, 7, 8]:
			var field := MapGrid.noise_field(1954 + cell, size, cell)
			var bad := 0
			for y in size:
				for x in size:
					if field[y * size + x] != MapMath.value_noise(1954 + cell, x, y, cell):
						bad += 1
			assert_eq(bad, 0, "noise mismatches, size %d cell %d" % [size, cell])

func test_regions_equal_the_reference_for_many_seeds() -> void:
	for size: int in [192, 70]:
		for seed: int in [1, 7, 1954, 40213, 99991]:
			var cell := 32 if size == 192 else 16
			var regions := MapGrid._regions(seed, size, cell)
			var bad := 0
			for y in size:
				for x in size:
					if regions[y * size + x] != MapMath.region_at(seed, x, y, size, cell):
						bad += 1
			assert_eq(bad, 0, "region mismatches, size %d seed %d" % [size, seed])
