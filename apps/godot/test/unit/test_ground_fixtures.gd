extends GutTest
## The ported ground data must reproduce the client's real pipeline (golden data from `pnpm godot:export`).

var _fx: Dictionary

func before_all() -> void:
	_fx = JSON.parse_string(FileAccess.get_file_as_string("res://data/ground-fixtures.json"))

func _seed_count() -> int:
	return _fx["seeds"].size()

func test_fixtures_include_the_mock_server_seed() -> void:
	var seeds := []
	for s: Dictionary in _fx["seeds"]:
		seeds.append(int(s["seed"]))
	assert_true(seeds.has(2975369092))
	assert_true(seeds.has(4294967295))
	assert_true(seeds.has(0))

func test_hash01_matches_known_values() -> void:
	# JavaScript: hash01(0, 0, 0) and a few more, computed with Math.imul; see terrain-props.ts.
	assert_eq(GroundMath.hash01(0, 0, 0), 0.0)
	for t: Array in [[3, 5, 1], [63, 63, 10], [-1, -1, 7], [10, 20, GroundMath.to_int32(4294967295) * 16 + 900]]:
		var v := GroundMath.hash01(t[0], t[1], t[2])
		assert_true(v >= 0.0 and v < 1.0, "hash01 in range %s" % [t])

func test_imul32_matches_known_products() -> void:
	assert_eq(GroundMath.imul32(374761393, 3), (374761393 * 3) & 0xFFFFFFFF)
	assert_eq(GroundMath.imul32(0xFFFFFFFF, 0xFFFFFFFF), 1, "(-1) * (-1) = 1 mod 2^32")
	assert_eq(GroundMath.imul32(65536, 65536), 0)
	assert_eq(GroundMath.imul32(-5, 3), (-15) & 0xFFFFFFFF)

## Godot's JSON parser can be a double-ulp off the written value, so a fixture float32 is rounded to float32 again
## before comparing (the client stores fertility in a Float32Array, so float32 is the exact value that matters).
func _f32(v: Variant) -> float:
	return PackedFloat32Array([float(v)])[0]

func test_fertility_matches() -> void:
	for s: Dictionary in _fx["seeds"]:
		var size := int(s["size"])
		var got := GroundMath.fertility_grid(int(s["seed"]), size)
		var bad := 0
		for y in size:
			var row: Array = s["fertility"][y]
			for x in size:
				if got[y * size + x] != _f32(row[x]):
					bad += 1
		assert_eq(bad, 0, "fertility mismatches, seed %s" % s["seed"])

func test_cluster_masks_match() -> void:
	for s: Dictionary in _fx["seeds"]:
		var size := int(s["size"])
		for kind in ["rocks", "grove"]:
			var got := GroundMath.cluster_mask(int(s["seed"]), size, kind)
			var bad := 0
			for y in size:
				var row: String = s[kind][y]
				for x in size:
					if got[y * size + x] != row.substr(x * 2, 2).hex_to_int():
						bad += 1
			assert_eq(bad, 0, "%s mismatches, seed %s" % [kind, s["seed"]])
