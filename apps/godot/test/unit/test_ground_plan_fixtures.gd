extends GutTest
## The ported ground plan (colours, prop plans, decals) must equal the client's real pipeline.

var _fx: Dictionary
var _region_cell: int

func before_all() -> void:
	_fx = JSON.parse_string(FileAccess.get_file_as_string("res://data/ground-fixtures.json"))
	_region_cell = int(Balance.data()["map"]["regionCell"])

## Decal atlas frames per kind, read from the copied manifest (the same source Phaser reads).
func _decal_frames_from_manifest() -> Dictionary:
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://art/terrain-manifest.json"))
	var out := {"sand": [], "grass": [], "stone": [], "track": []}
	var frames: Array = manifest["decals"]["frames"]
	for i in frames.size():
		out[frames[i]["kind"]].append(i)
	return out

func _plan_for(s: Dictionary) -> Dictionary:
	var size := int(s["size"])
	var seed := int(s["seed"])
	var grid := MapGrid.compute(seed, size, _region_cell)
	var geo := Geography.build(seed, size, _region_cell, grid["terrain"], grid["regions"])
	var flags := Geography.with_oasis_front(geo["flags"], geo["oases"], size)
	var fertility := GroundMath.fertility_grid(seed, size)
	var rocks := GroundMath.cluster_mask(seed, size, "rocks")
	var grove := GroundMath.cluster_mask(seed, size, "grove")
	return GroundPlan.build(seed, size, grid["terrain"], flags, fertility, rocks, grove, _decal_frames_from_manifest())

func test_palette_matches_the_theme() -> void:
	assert_eq(GroundPlan.PALETTE.size(), _fx["palette"].size())
	for i in GroundPlan.PALETTE.size():
		assert_eq(GroundPlan.PALETTE[i], int(_fx["palette"][i]))

func test_decal_kinds_from_the_manifest_match_the_fixture() -> void:
	var got := _decal_frames_from_manifest()
	for kind: String in _fx["decalKindFrames"]:
		var want: Array = _fx["decalKindFrames"][kind]
		assert_eq(got[kind].size(), want.size(), kind)
		for i in want.size():
			assert_eq(int(got[kind][i]), int(want[i]), kind)

func test_oasis_front_bit_matches() -> void:
	assert_eq(Geography.OASIS_FRONT, int(_fx["oasisFront"]))

func test_colours_match_for_every_seed() -> void:
	for s: Dictionary in _fx["seeds"]:
		var size := int(s["size"])
		var plan := _plan_for(s)
		var colours: PackedInt32Array = plan["colours"]
		var bad := 0
		for y in size:
			var row: String = s["colours"][y]
			for x in size:
				if colours[y * size + x] != row.substr(x * 6, 6).hex_to_int():
					bad += 1
		assert_eq(bad, 0, "colour mismatches, seed %s" % s["seed"])

func _near(a: float, b: float) -> bool:
	return absf(a - b) <= 1e-12 * maxf(1.0, absf(b))

## Trees and scrub still follow Phaser's golden data; rocks and the massif are our own since the 3D pieces (tested below).
func test_trees_and_scrub_match_for_every_seed() -> void:
	var golden := func(p: Variant) -> bool:
		return (p["kind"] if p is Dictionary else p[1]) in ["trees", "scrub"]
	for s: Dictionary in _fx["seeds"]:
		var plan := _plan_for(s)
		var got: Array = plan["props"].filter(golden)
		var want: Array = s["props"].filter(golden)
		assert_eq(got.size(), want.size(), "prop count, seed %s" % s["seed"])
		var bad := 0
		for k in mini(got.size(), want.size()):
			var g: Dictionary = got[k]
			var w: Array = want[k]
			var same_frames: bool = (g["frames"] == null and w[7] == null) or (g["frames"] != null and w[7] != null and g["frames"].size() == w[7].size())
			if same_frames and g["frames"] != null:
				for f in w[7].size():
					same_frames = same_frames and int(g["frames"][f]) == int(w[7][f])
			if g["i"] != int(w[0]) or g["kind"] != w[1] or not _near(g["pick"], w[2]) or not _near(g["dx"], w[3]) or not _near(g["dy"], w[4]) or not _near(g["scale"], w[5]) or (1 if g["flip"] else 0) != int(w[6]) or not same_frames:
				bad += 1
		assert_eq(bad, 0, "prop mismatches, seed %s" % s["seed"])

func test_decals_match_for_every_seed() -> void:
	for s: Dictionary in _fx["seeds"]:
		var plan := _plan_for(s)
		var got: Array = plan["decals"]
		var want: Array = s["decals"]
		assert_eq(got.size(), want.size(), "decal count, seed %s" % s["seed"])
		var bad := 0
		for k in mini(got.size(), want.size()):
			var g: Dictionary = got[k]
			var w: Array = want[k]
			if not _near(g["x"], w[0]) or not _near(g["y"], w[1]) or g["frame"] != int(w[2]) or not _near(g["scale"], w[3]) or (1 if g["flip"] else 0) != int(w[4]) or not _near(g["alpha"], w[5]):
				bad += 1
		assert_eq(bad, 0, "decal mismatches, seed %s" % s["seed"])

func test_a_mountain_gets_massif_pieces_by_depth_and_few_boulders() -> void:
	var size := 7
	var terrain := PackedInt32Array()
	terrain.resize(size * size)
	terrain.fill(GroundPlan.T_PLAIN)
	for y in range(1, 6):
		for x in range(1, 6):
			terrain[y * size + x] = GroundPlan.T_MOUNTAIN
	var flags := PackedByteArray()
	flags.resize(size * size)
	assert_eq(GroundPlan.mountain_depth(terrain, flags, size, 1, 1), 0, "edge")
	assert_eq(GroundPlan.mountain_depth(terrain, flags, size, 2, 2), 1, "one in")
	assert_eq(GroundPlan.mountain_depth(terrain, flags, size, 3, 3), 2, "middle")
	flags[3 * size + 4] = Geography.GEO_ROAD
	assert_eq(GroundPlan.mountain_depth(terrain, flags, size, 3, 3), 0, "a road through it is its edge")
	for depth in 3:
		var props := GroundPlan.props_for(GroundPlan.T_MOUNTAIN, 3, 3, 1.0, 0, 0.0, 0.0, 0.0, depth)
		var pieces := props.filter(func(p: Dictionary) -> bool: return p["kind"] == "peaks")
		# Foothills leave some edge tiles bare; inside, every tile has its piece.
		assert_eq(pieces.size(), 1 if depth > 0 else pieces.size(), "one piece, depth %d" % depth)
		assert_lte(pieces.size(), 1, "at most one piece, depth %d" % depth)
		for p: Dictionary in pieces:
			assert_eq(p["frames"], GroundPlan.massif_frames(depth), "frames, depth %d" % depth)
		if depth > 0:
			assert_eq(props.filter(func(p: Dictionary) -> bool: return p["kind"] == "rocks").size(), 0, "no boulders inside, depth %d" % depth)

func test_rocks_are_fewer_than_the_phaser_plan() -> void:
	for s: Dictionary in _fx["seeds"]:
		var got := (_plan_for(s)["props"] as Array).filter(func(p: Dictionary) -> bool: return p["kind"] == "rocks").size()
		var was := (s["props"] as Array).filter(func(p: Array) -> bool: return p[1] == "rocks").size()
		assert_lt(got, int(was * 0.6), "rocks, seed %s" % s["seed"])
