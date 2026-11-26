extends GutTest
## The ported map math must reproduce the real TypeScript rules (golden data from `pnpm godot:export`).

var _fx: Dictionary
var _region_cell: int

func before_all() -> void:
	_fx = JSON.parse_string(FileAccess.get_file_as_string("res://data/map-fixtures.json"))
	_region_cell = int(Balance.data()["map"]["regionCell"])

func test_hash32_matches() -> void:
	for c: Dictionary in _fx["hash"]:
		var inputs: Array = []
		for v in c["inputs"]:
			inputs.append(int(v))
		assert_eq(MapMath.hash32(inputs), int(c["out"]), "hash32 %s" % [c["inputs"]])

func test_value_noise_matches() -> void:
	for c: Dictionary in _fx["noise"]:
		var got := MapMath.value_noise(int(c["seed"]), int(c["x"]), int(c["y"]), int(c["cell"]))
		assert_almost_eq(got, float(c["out"]), 1e-12, "noise %s" % [c])

func test_terrain_grids_match_for_every_seed() -> void:
	var size := int(_fx["size"])
	for s: Dictionary in _fx["seeds"]:
		var mismatches := 0
		for y in size:
			var row: String = s["terrain"][y]
			for x in size:
				if MapMath.terrain_at(int(s["seed"]), x, y) != MapMath.TERRAIN_BY_LETTER[row[x]]:
					mismatches += 1
		assert_eq(mismatches, 0, "terrain mismatches for seed %s" % s["seed"])

func test_base_sites_match_for_every_seed() -> void:
	var size := int(_fx["size"])
	for s: Dictionary in _fx["seeds"]:
		var mismatches := 0
		for y in size:
			var row: String = s["baseSites"][y]
			for x in size:
				if MapMath.base_site_ok(int(s["seed"]), size, x, y, s["zones"]) != (row[x] == "1"):
					mismatches += 1
		assert_eq(mismatches, 0, "base site mismatches for seed %s" % s["seed"])

func test_region_grids_match_for_every_seed() -> void:
	var size := int(_fx["size"])
	for s: Dictionary in _fx["seeds"]:
		var mismatches := 0
		for y in size:
			var row: String = s["regions"][y]
			for x in size:
				if MapMath.region_at(int(s["seed"]), x, y, size, _region_cell) != row[x].hex_to_int():
					mismatches += 1
		assert_eq(mismatches, 0, "region mismatches for seed %s" % s["seed"])

func test_region_sites_match() -> void:
	var size := int(_fx["size"])
	for s: Dictionary in _fx["seeds"]:
		for id in s["sites"].size():
			var want: Dictionary = s["sites"][id]
			var got := MapMath.region_site(int(s["seed"]), id, size, _region_cell)
			assert_almost_eq(got[0], float(want["x"]), 1e-12, "site x seed %s id %d" % [s["seed"], id])
			assert_almost_eq(got[1], float(want["y"]), 1e-12, "site y seed %s id %d" % [s["seed"], id])

func test_fixtures_cover_all_terrain_types() -> void:
	var seen := {}
	for s: Dictionary in _fx["seeds"]:
		for row: String in s["terrain"]:
			for ch in row:
				seen[ch] = true
	assert_eq(seen.keys().size(), 4, "fixtures should contain plain, hills, forest and mountain")
