extends GutTest

func _flat(size: int) -> Dictionary:
	var terrain := PackedInt32Array()
	terrain.resize(size * size)
	terrain.fill(GroundPlan.T_PLAIN)
	var flags := PackedByteArray()
	flags.resize(size * size)
	return {"terrain": terrain, "flags": flags}

func test_a_route_starts_and_ends_on_its_tiles_and_walks_by_fraction() -> void:
	var m := _flat(20)
	var g := RoutePath.grid_for(20, m["terrain"], m["flags"])
	var p := RoutePath.route(g, Vector2i(2, 3), Vector2i(15, 9))
	assert_eq(p[0], Vector2(2.5, 3.5))
	assert_eq(p[p.size() - 1], Vector2(15.5, 9.5))
	assert_eq(RoutePath.point_at(p, 0.0), p[0])
	assert_eq(RoutePath.point_at(p, 1.0), p[p.size() - 1])
	var mid := RoutePath.point_at(p, 0.5)
	assert_almost_eq(RoutePath.length(p) * 0.5, _along(p, mid), 0.05, "half way is half the length")
	assert_lte(RoutePath.length(p), Vector2(2, 3).distance_to(Vector2(15, 9)) * RoutePath.LONGEST + 0.001)

func _along(p: PackedVector2Array, q: Vector2) -> float:
	var total := 0.0
	for i in p.size() - 1:
		var seg := Geometry2D.get_closest_point_to_segment(q, p[i], p[i + 1])
		if seg.distance_to(q) < 0.0001:
			return total + p[i].distance_to(q)
		total += p[i].distance_to(p[i + 1])
	return -1.0

func test_a_route_keeps_to_a_road_going_its_way_and_round_mountains() -> void:
	var size := 20
	var m := _flat(size)
	# A road along row 10; mountains filling rows 4..8 between x 6 and 13.
	for x in size:
		m["flags"][10 * size + x] = Geography.GEO_ROAD
	for y in range(4, 9):
		for x in range(6, 14):
			m["terrain"][y * size + x] = GroundPlan.T_MOUNTAIN
	var g := RoutePath.grid_for(size, m["terrain"], m["flags"])
	var p := RoutePath.route(g, Vector2i(1, 10), Vector2i(18, 10))
	for q: Vector2 in p:
		assert_almost_eq(q.y, 10.5, 0.01, "stays on the road")
	var round := RoutePath.route(g, Vector2i(9, 2), Vector2i(9, 12))
	for q: Vector2 in round:
		assert_false(m["terrain"][int(q.y) * size + int(q.x)] == GroundPlan.T_MOUNTAIN and round.size() > 2, "never on a mountain tile")

func test_a_route_off_the_map_or_to_itself_is_straight() -> void:
	var m := _flat(8)
	var g := RoutePath.grid_for(8, m["terrain"], m["flags"])
	assert_eq(RoutePath.route(g, Vector2i(1, 1), Vector2i(1, 1)).size(), 2)
	assert_eq(RoutePath.route(g, Vector2i(1, 1), Vector2i(20, 1)).size(), 2)
	assert_eq(RoutePath.route(null, Vector2i(1, 1), Vector2i(5, 1)).size(), 2)

func test_column_size_follows_the_troops() -> void:
	assert_eq(MarchMarkers.figures_for(0), 2)
	assert_eq(MarchMarkers.figures_for(24), 2)
	assert_eq(MarchMarkers.figures_for(25), 3)
	assert_eq(MarchMarkers.figures_for(10000), MarchMarkers.MAX_FIGURES)
	assert_eq(MarchMarkers.column_for(2).size(), 2)
	assert_eq(MarchMarkers.column_for(3).size(), 3)
	assert_eq(MarchMarkers.column_for(4).size(), 4)
