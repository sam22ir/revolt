extends GutTest
## The camp's pictures: every building at every level has its look's files, the looks go up with the level, and figures sort
## behind or in front of a building by its base line.

const NOW := 5_000_000

func _levels(level: int) -> Dictionary:
	var out := {}
	for id in CampLayout.BUILDINGS:
		out[id] = level
	return out

func test_every_building_at_every_level_resolves_to_pictures_that_load() -> void:
	for id in CampLayout.BUILDINGS:
		for level in range(1, int(Balance.data()["buildings"][id]["levels"].size()) + 1):
			var look := CampArt.look_for(level)
			for tex: Texture2D in [CampArt.body(id, look), CampArt.shade(id, look), CampArt.card(id, look)]:
				assert_not_null(tex, "%s %d" % [id, level])
			assert_almost_eq(CampArt.body(id, look).get_size() / 3.0, CampArt.body_rect(id, look).size, Vector2.ONE * 0.4, "1.5 px per painting px: %s" % id)
		assert_not_null(CampArt.scaffold(id), id)

func test_the_ground_covers_the_world() -> void:
	for row in CampArt.ROWS:
		for col in CampArt.COLS:
			assert_eq(CampArt.ground_tile(col, row).get_size(), CampLayout.WORLD * 3.0 / Vector2(CampArt.COLS, CampArt.ROWS))

func test_looks_go_up_with_the_level_and_odd_levels_are_safe() -> void:
	assert_eq(CampArt.look_for(1), 1)
	assert_eq(CampArt.look_for(2), 1)
	assert_eq(CampArt.look_for(3), 2)
	assert_eq(CampArt.look_for(6), 3)
	assert_eq(CampArt.look_for(10), 4)
	assert_eq(CampArt.look_for(0), 1)
	assert_eq(CampArt.look_for(99), 4)

func test_feet_above_the_base_line_are_behind_and_below_it_in_front() -> void:
	for id in CampLayout.BUILDINGS:
		var front := CampArt.base(id, 1)[1]
		assert_false(CampArt.is_behind(id, 1, front + Vector2(0, 6)), "%s: in front of its corner" % id)
		assert_true(CampArt.is_behind(id, 1, front - Vector2(0, 30)), "%s: inside its walls" % id)
		assert_false(CampArt.is_behind(id, 1, front + Vector2(2000, 0)), "%s: far away" % id)

func test_everyone_is_drawn_once() -> void:
	var picture := CampPicture.new()
	add_child_autofree(picture)
	picture.build()
	for level in [1, 10]:
		picture.set_state(_levels(level), "farm", NOW)
		var parts := picture.sorted_figures()
		assert_eq(parts[0].size() + parts[1].size(), CampLife.figures(NOW).size())

func test_the_picture_draws_when_told_the_time_and_not_on_its_own() -> void:
	var picture := CampPicture.new()
	add_child_autofree(picture)
	picture.build()
	picture.set_state(_levels(1), "farm", NOW)
	await wait_physics_frames(2)
	var before := picture.draw_count
	assert_gt(before, 0)
	await wait_physics_frames(3)
	assert_eq(picture.draw_count, before)
