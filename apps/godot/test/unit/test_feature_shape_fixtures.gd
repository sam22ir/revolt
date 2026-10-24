extends GutTest
## The shaped wadi and road polylines must equal the client's FeatureLayer output (seeds that carry them).

var _fx: Dictionary
var _region_cell: int

func before_all() -> void:
	_fx = JSON.parse_string(FileAccess.get_file_as_string("res://data/ground-fixtures.json"))
	_region_cell = int(Balance.data()["map"]["regionCell"])

func _same_paths(got: Array, want: Array) -> int:
	# Returns the number of mismatching points (or a large number if the shapes differ).
	if got.size() != want.size():
		return 1_000_000
	var bad := 0
	for i in got.size():
		if got[i].size() != want[i].size():
			return 1_000_000
		for j in got[i].size():
			for c in 3:
				if absf(float(got[i][j][c]) - float(want[i][j][c])) > 1e-9:
					bad += 1
	return bad

func test_shaped_paths_match() -> void:
	var checked := 0
	for s: Dictionary in _fx["seeds"]:
		if s["featureWadis"] == null:
			continue
		checked += 1
		var size := int(s["size"])
		var seed := int(s["seed"])
		var grid := MapGrid.compute(seed, size, _region_cell)
		var geo := Geography.build(seed, size, _region_cell, grid["terrain"], grid["regions"])
		assert_eq(_same_paths(FeatureShape.wadi_paths(geo["wadis"]), s["featureWadis"]), 0, "wadi shape, seed %s" % seed)
		assert_eq(_same_paths(FeatureShape.road_paths(geo["roads"]), s["featureRoads"]), 0, "road shape, seed %s" % seed)
	assert_gt(checked, 0, "no fixture seed carries shaped paths")

func test_smooth_keeps_end_points_and_short_paths() -> void:
	var two := [[0.0, 0.0, 1.0], [1.0, 1.0, 1.0]]
	assert_eq(FeatureShape.smooth(two, 4).size(), 2, "a two-point path is left alone")
	var three := [[0.0, 0.0, 1.0], [1.0, 0.0, 1.0], [1.0, 1.0, 1.0]]
	var smoothed := FeatureShape.smooth(three, 1)
	assert_eq(smoothed[0], three[0])
	assert_eq(smoothed[smoothed.size() - 1], three[2])

func test_trim_ends_shortens_the_line_by_the_trim() -> void:
	var line := [[0.0, 0.0, 1.0], [5.0, 0.0, 1.0], [10.0, 0.0, 1.0]]
	var trimmed := FeatureShape.trim_ends(line, 0.55)
	assert_almost_eq(trimmed[0][0], 0.55, 1e-9)
	assert_almost_eq(trimmed[trimmed.size() - 1][0], 9.45, 1e-9)

func test_a_two_point_line_is_never_trimmed() -> void:
	# Same as the TypeScript: trimming only runs while there are more than two points.
	var line := [[0.0, 0.0, 1.0], [10.0, 0.0, 1.0]]
	assert_eq(FeatureShape.trim_ends(line, 0.55), line)
