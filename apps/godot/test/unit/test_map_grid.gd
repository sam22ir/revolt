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
