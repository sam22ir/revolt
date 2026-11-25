extends GutTest
## The roads, riverbeds and oases are a few mesh surfaces, not thousands of draw calls.

func _painter() -> FeaturePainter:
	var p := FeaturePainter.new()
	add_child_autofree(p)
	return p

## A straight path along +x in tile space: `n` points, width factor `w`.
func _path(n: int, w: float = 1.0) -> Array:
	var out := []
	for i in n:
		out.append([10.0 + i * 0.1, 10.0, w])
	return out

func test_nothing_to_draw_builds_nothing() -> void:
	var p := _painter()
	p.setup([], [], [])
	assert_eq(p.surface_count(), 0)
	assert_eq(p.triangle_count, 0)

func test_a_road_is_two_strokes_one_surface_each() -> void:
	var p := _painter()
	p.setup([], [_path(50)], [])
	assert_eq(p.surface_count(), 2, "edge and top")
	assert_gt(p.triangle_count, 0)

func test_a_wadi_has_bank_bed_and_pebbles_and_gravel_bars_only_where_wide() -> void:
	var narrow := _painter()
	narrow.setup([_path(60, 1.0)], [], [])
	assert_false(narrow.surface_count() == 0)
	var wide := _painter()
	wide.setup([_path(60, 1.2)], [], [])
	assert_gt(wide.surface_count(), narrow.surface_count(), "the pale bars appear when the bed is wide (factor >= 1.05)")

func test_an_oasis_is_three_ellipse_layers() -> void:
	var p := _painter()
	p.setup([], [], [Vector2i(20, 20)])
	assert_eq(p.surface_count(), 3, "rim, water, shine")
	assert_eq(p.triangle_count, 3 * FeaturePainter.ELLIPSE_SEGMENTS)

func test_the_stroke_has_the_wanted_width() -> void:
	var layer := FeaturePainter.StrokeLayer.new(Color.WHITE)
	layer.stroke(_path(5), 30.0)
	# The first two vertices are the left and right edge at the first point: 30 px apart, across the path.
	var across := layer.vertices[0].distance_to(layer.vertices[1])
	assert_almost_eq(across, 30.0, 1e-3)

func test_a_run_is_split_where_the_width_factor_drops() -> void:
	var path := _path(10, 1.2)
	path[5] = [path[5][0], path[5][1], 0.5]
	var broken := FeaturePainter.StrokeLayer.new(Color.WHITE)
	broken.stroke(path, 30.0, 1.05)
	var whole := FeaturePainter.StrokeLayer.new(Color.WHITE)
	whole.stroke(_path(10, 1.2), 30.0, 1.05)
	# Two runs have four round caps, an unbroken path two; the gap's quad is missing, so the strips are shorter by two quads.
	var cap := FeaturePainter.ELLIPSE_SEGMENTS * 3
	assert_eq(whole.indices.size(), 9 * 6 + 2 * cap)
	assert_eq(broken.indices.size(), (4 + 3) * 6 + 4 * cap)

func test_a_realistic_path_stays_small() -> void:
	# 640 points like the shaped paths: a few thousand triangles per stroke, nowhere near the old 300,000 canvas objects.
	var p := _painter()
	p.setup([_path(640, 1.2)], [_path(640)], [])
	assert_lt(p.triangle_count, 16_000)
	assert_lt(p.surface_count(), 10, "a handful of draw calls")

func test_the_layer_can_be_hidden() -> void:
	var p := _painter()
	p.setup([], [_path(10)], [])
	p.visible = false
	assert_false(p.is_visible_in_tree())
