extends GutTest
## The ported geography (wadis, roads, oases, flags) must equal the real rules' output tile for tile.

var _fx: Dictionary
var _region_cell: int

func before_all() -> void:
	_fx = JSON.parse_string(FileAccess.get_file_as_string("res://data/ground-fixtures.json"))
	_region_cell = int(Balance.data()["map"]["regionCell"])

func _paths_equal(got: Array, want: Array) -> bool:
	if got.size() != want.size():
		return false
	for i in got.size():
		if got[i].size() != want[i].size():
			return false
		for j in got[i].size():
			if got[i][j].x != int(want[i][j][0]) or got[i][j].y != int(want[i][j][1]):
				return false
	return true

func test_geography_matches_for_every_seed() -> void:
	for s: Dictionary in _fx["seeds"]:
		var size := int(s["size"])
		var seed := int(s["seed"])
		var grid := MapGrid.compute(seed, size, _region_cell)
		var geo := Geography.build(seed, size, _region_cell, grid["terrain"], grid["regions"])
		assert_true(_paths_equal(geo["wadis"], s["wadis"]), "wadis, seed %s" % seed)
		assert_true(_paths_equal(geo["roads"], s["roads"]), "roads, seed %s" % seed)
		var oases: Array = geo["oases"]
		assert_eq(oases.size(), s["oases"].size(), "oasis count, seed %s" % seed)
		for i in mini(oases.size(), s["oases"].size()):
			assert_eq(oases[i], Vector2i(int(s["oases"][i][0]), int(s["oases"][i][1])), "oasis %d, seed %s" % [i, seed])
		var flags := Geography.with_oasis_front(geo["flags"], oases, size)
		var bad := 0
		for y in size:
			var row: String = s["flags"][y]
			for x in size:
				if flags[y * size + x] != row.substr(x * 2, 2).hex_to_int():
					bad += 1
		assert_eq(bad, 0, "flag mismatches, seed %s" % seed)

func test_geography_build_time_is_reported() -> void:
	var seed := 2975369092
	var grid := MapGrid.compute(seed, 64, _region_cell)
	var t0 := Time.get_ticks_msec()
	Geography.build(seed, 64, _region_cell, grid["terrain"], grid["regions"])
	var ms := Time.get_ticks_msec() - t0
	gut.p("geography build: %d ms (native)" % ms)
	assert_lt(ms, 3000, "geography is far too slow to build at load")
