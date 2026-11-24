extends GutTest
## The frontier's geometry: what is mirrored where, and that it stays outside the map.

func test_the_land_outside_mirrors_the_map() -> void:
	assert_eq(Frontier.mirror(0, 64), 0)
	assert_eq(Frontier.mirror(63, 64), 63)
	assert_eq(Frontier.mirror(-1, 64), 0, "the first tile outside is the edge tile again")
	assert_eq(Frontier.mirror(-3, 64), 2)
	assert_eq(Frontier.mirror(64, 64), 63)
	assert_eq(Frontier.mirror(66, 64), 61)

func test_distance_outside() -> void:
	assert_eq(Frontier.distance(0, 63, 64), 0)
	assert_eq(Frontier.distance(-1, 10, 64), 1)
	assert_eq(Frontier.distance(64, 70, 64), 7)

func test_mirrored_props_stand_outside_clear_of_the_fence_and_each_on_one_side() -> void:
	var props: Array = []
	for i in 64 * 64:
		props.append({"i": i, "kind": "trees", "pick": 0.0, "dx": 0.0, "dy": 0.0, "scale": 1.0, "flip": false, "frames": null})
	var seen := {}
	for behind in [true, false]:
		for p: Dictionary in Frontier.mirrored_props(props, 64, behind):
			var d := Frontier.distance(p["x"], p["y"], 64)
			if d < Frontier.CLEAR or d > Frontier.DEPTH:
				fail_test("a prop at distance %d" % d)
			var key := Vector2i(p["x"], p["y"])
			if seen.has(key):
				fail_test("%s drawn on both sides" % key)
			seen[key] = true
	var wide := 64 + Frontier.DEPTH * 2
	var near := 64 + (Frontier.CLEAR - 1) * 2
	assert_eq(seen.size(), wide * wide - near * near)
	assert_false(props[0].has("x"), "the map's own props are untouched")

func test_mirrored_decals_are_outside_and_clear_of_the_strip() -> void:
	for x: float in [0.5, 2.5, 5.5, 31.0, 63.5]:
		for d: Dictionary in Frontier.mirrored_decals([{"x": x, "y": 40.0, "frame": 1, "scale": 1.0, "flip": false, "alpha": 1.0}], 64):
			var out_by := maxf(maxf(-float(d["x"]), float(d["x"]) - 64.0), maxf(-float(d["y"]), float(d["y"]) - 64.0))
			assert_between(out_by, float(Frontier.CLEAR), float(Frontier.DECAL_DEPTH))
	var near := Frontier.mirrored_decals([{"x": 5.5, "y": 40.0, "frame": 1, "scale": 1.0, "flip": false, "alpha": 1.0}], 64)
	assert_true(near.any(func(d: Dictionary) -> bool: return d["x"] == -5.5 and d["y"] == 40.0), "mirrored across the near edge")

func test_towers_stand_on_the_outer_fence_and_every_corner_has_one() -> void:
	var all := {}
	for side in [FrontierView.Side.BEHIND, FrontierView.Side.FRONT]:
		var view: FrontierView = autofree(FrontierView.new(side))
		view._size = 64
		for p in view.tower_spots():
			assert_false(all.has(p), "one tower per spot")
			all[p] = true
	for c in Frontier.outline(64, Frontier.OUTER):
		assert_true(all.keys().any(func(p: Vector2) -> bool: return p.distance_to(c) < 1.0), "a tower on corner %s" % c)
	assert_eq(all.size(), 16, "four per edge")

func test_the_camera_centre_stays_on_the_map() -> void:
	var inside := Iso.tile_center(10, 50)
	assert_almost_eq(CameraMath.clamp_to_map(inside, 64), inside, Vector2.ONE * 0.01)
	var tile := Iso.world_to_tile(CameraMath.clamp_to_map(Iso.tile_to_world(-20, 90), 64))
	assert_almost_eq(tile, Vector2(0, 64), Vector2.ONE * 0.01)
