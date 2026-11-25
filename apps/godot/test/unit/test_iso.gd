extends GutTest

func test_origin_is_the_top_corner_of_tile_zero() -> void:
	assert_eq(Iso.tile_to_world(0, 0), Vector2.ZERO)

func test_axes_match_the_phaser_layout() -> void:
	# +x goes down-right, +y goes down-left; a tile is 96 wide, 48 tall.
	assert_eq(Iso.tile_to_world(1, 0), Vector2(48, 24))
	assert_eq(Iso.tile_to_world(0, 1), Vector2(-48, 24))
	assert_eq(Iso.tile_to_world(1, 1), Vector2(0, 48))

func test_round_trip() -> void:
	for t: Vector2 in [Vector2(0, 0), Vector2(10.5, 3.25), Vector2(63, 63), Vector2(0, 40)]:
		var back := Iso.world_to_tile(Iso.tile_to_world(t.x, t.y))
		assert_almost_eq(back.x, t.x, 1e-4)
		assert_almost_eq(back.y, t.y, 1e-4)

func test_tile_center() -> void:
	assert_eq(Iso.tile_center(0, 0), Vector2(0, 24))

func test_bounds_contain_every_tile_corner_of_a_64_map() -> void:
	var b := Iso.world_bounds(64)
	for t: Vector2 in [Vector2(0, 0), Vector2(64, 0), Vector2(0, 64), Vector2(64, 64)]:
		assert_true(b.has_point(Iso.tile_to_world(t.x, t.y)) or b.grow(0.01).has_point(Iso.tile_to_world(t.x, t.y)), "corner %s" % t)

func test_footprint_of_one_tile() -> void:
	var f := Iso.footprint(2, 3, 1, 1)
	assert_eq(f[0], Iso.tile_to_world(2, 3))
	assert_eq(f[2], Iso.tile_to_world(3, 4))
