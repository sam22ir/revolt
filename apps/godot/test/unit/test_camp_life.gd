extends GutTest
## The living camp: walkers stay on their routes and off the buildings, everything depends only on the time it is given, and it
## survives odd clocks.

const NOW := 1_793_800_000_000

func _route_length(points: Array) -> float:
	var total := 0.0
	for i in range(1, points.size()):
		total += (points[i] as Vector2).distance_to(points[i - 1])
	return total

func test_a_walker_goes_to_the_end_and_comes_back() -> void:
	var points := [Vector2(0, 0), Vector2(100, 0), Vector2(100, 50)]
	assert_eq(CampLife.along(points, 0.0)["at"], Vector2(0, 0))
	assert_almost_eq(CampLife.along(points, 60.0)["at"], Vector2(60, 0), Vector2.ONE * 0.001)
	assert_eq(CampLife.along(points, 150.0)["at"], Vector2(100, 50), "the far end")
	assert_almost_eq(CampLife.along(points, 240.0)["at"], Vector2(60, 0), Vector2.ONE * 0.001, "on the way back")
	assert_eq(CampLife.along(points, 300.0)["at"], Vector2(0, 0), "home again")
	assert_almost_eq(CampLife.along(points, 360.0)["at"], Vector2(60, 0), Vector2.ONE * 0.001, "and round again")

func test_a_walker_faces_the_way_it_is_going() -> void:
	var points := [Vector2(0, 0), Vector2(100, 0)]
	assert_eq(CampLife.along(points, 50.0)["way"], 0, "right")
	assert_eq(CampLife.along(points, 150.0)["way"], 4, "and back left")
	assert_eq(CampLife.way(Vector2(0, -1)), 2, "away")
	assert_eq(CampLife.way(Vector2(0, 1)), 6, "towards the viewer")
	assert_eq(CampLife.way(Vector2(2, -1)), 1, "along a wall, away to the right")
	assert_eq(CampLife.way(Vector2(-2, 1)), 5)

func test_a_clock_that_steps_back_or_jumps_far_still_gives_a_place_on_the_route() -> void:
	var points: Array = CampLayout.ROUTES["road"]
	for distance: float in [-1.0, -5000.0, 0.0, 1e12]:
		var at: Vector2 = CampLife.along(points, distance)["at"]
		assert_true(at.is_finite(), str(distance))
		assert_true(Rect2(Vector2.ZERO, CampLayout.WORLD).grow(1.0).has_point(at), str(distance))

func test_every_route_stays_on_the_painting_and_off_the_buildings() -> void:
	var world := Rect2(Vector2.ZERO, CampLayout.WORLD).grow(1.0)
	for route: String in CampLayout.ROUTES:
		var points: Array = CampLayout.ROUTES[route]
		var length := _route_length(points)
		var d := 0.0
		while d <= length:
			var at: Vector2 = CampLife.along(points, d)["at"]
			assert_true(world.has_point(at), "%s at %s" % [route, d])
			for look in range(1, 5):
				var looks := {}
				for id in CampLayout.BUILDINGS:
					looks[id] = look
				assert_eq(CampLayout.building_at(at, looks), "", "%s at %s, look %d" % [route, d, look])
			d += 4.0

func test_every_walker_uses_a_known_route_and_every_figure_loads() -> void:
	for w: Dictionary in CampLayout.WALKERS:
		assert_true(CampLayout.ROUTES.has(w["route"]), str(w))
		assert_true(CampLife.KINDS.has(w["kind"]), str(w))
	for s: Dictionary in CampLayout.STANDING:
		assert_true(CampLife.KINDS.has(s["kind"]), str(s))
	for kind in CampLife.KINDS:
		assert_eq(CampLife.sheet(kind).get_size(), CampLife.CELL * Vector2(CampLife.WAYS, CampLife.STEPS), kind)

func test_the_same_time_gives_the_same_scene_and_time_moves_it() -> void:
	assert_eq(CampLife.figures(NOW), CampLife.figures(NOW))
	assert_ne(CampLife.figures(NOW), CampLife.figures(NOW + 5000))

func test_figures_are_drawn_farthest_first() -> void:
	var list := CampLife.figures(NOW)
	assert_eq(list.size(), CampLayout.WALKERS.size() + CampLayout.STANDING.size())
	for i in range(1, list.size()):
		assert_gte(list[i]["at"].y, list[i - 1]["at"].y)

func test_walkers_change_step_and_stand_still_figures_do_not() -> void:
	var seen := {}
	for t in range(0, 2000, 70):
		for f: Dictionary in CampLife.figures(NOW + t):
			if f["kind"] == "mule":
				seen[f["frame"]] = true
			if f["kind"] == "guard":
				assert_eq(f["frame"], 0)
	assert_eq(seen.size(), CampLife.STEPS, "every step of the walk shows")

func test_smoke_rises_fades_and_starts_again() -> void:
	var young := CampLife.puff(0, 0)
	var old := CampLife.puff(0, int(CampLife.SMOKE_LIFE_S * 1000.0 * 0.9))
	assert_lt(old["at"].y, -40.0, "it has risen")
	assert_gt(old["radius"], young["radius"], "it has swelled")
	assert_lt(old["alpha"], CampLife.SMOKE_COLOR.a * 0.2, "it has faded")
	assert_almost_eq(float(CampLife.puff(0, int(CampLife.SMOKE_LIFE_S * 1000.0))["alpha"]), 0.0, 0.001, "and starts again")

func test_the_layer_redraws_when_told_the_time_and_not_on_its_own() -> void:
	var life := CampLife.new()
	life.build()
	add_child_autofree(life)
	await wait_physics_frames(2)
	var before := life.draw_count
	await wait_physics_frames(3)
	assert_eq(life.draw_count, before, "no redraw without a tick")
	life.tick(NOW, Vector2.ZERO)
	await wait_physics_frames(2)
	assert_gt(life.draw_count, before)

func test_the_base_view_passes_the_time_to_the_layer() -> void:
	var layer := CanvasLayer.new()
	add_child_autofree(layer)
	var view := BaseView.new()
	view.layer = layer
	layer.add_child(view)
	view.build()
	view.set_state({"hq": 1, "farm": 1, "armory": 1, "treasury": 1, "barracks": 1, "hero_hall": 1}, null, NOW)
	assert_eq(view._life._now_ms, NOW)
