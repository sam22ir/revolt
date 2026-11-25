extends GutTest
## MapPicker: the tile a tap means, from the shapes the overlay draws, the top shape first.

const SIZE := 32

func _snap(bases := [], npcs := [], hqs := []) -> Dictionary:
	return {"bases": bases, "npcs": npcs, "hqs": hqs}

func _npc(x: int, y: int) -> Dictionary:
	return {"id": "n", "kind": "patrol", "level": 1, "x": x, "y": y, "region": 1}

func test_empty_land_gives_the_tile_under_the_finger_and_off_the_map_gives_none() -> void:
	var snap := _snap()
	assert_eq(MapPicker.pick(snap, SIZE, Iso.tile_center(5, 7)), Vector2i(5, 7))
	assert_eq(MapPicker.pick(snap, SIZE, Iso.tile_to_world(-3.0, 4.0)), Vector2i(-1, -1))
	assert_eq(MapPicker.pick(snap, SIZE, Iso.tile_to_world(40.0, 4.0)), Vector2i(-1, -1))

func test_any_tile_of_a_camps_square_taps_the_camp() -> void:
	var snap := _snap([{"tag": "AAAA", "x": 10, "y": 10, "mine": true, "alliance": null}])
	for d in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]:
		assert_eq(MapPicker.pick(snap, SIZE, Iso.tile_center(10 + d.x, 10 + d.y)), Vector2i(10, 10), "tile +%s" % d)
	assert_eq(MapPicker.pick(snap, SIZE, Iso.tile_center(12, 10)), Vector2i(12, 10), "just outside the square is land")

func test_a_site_tile_taps_the_site_tile_and_a_camp_on_it_wins() -> void:
	var snap := _snap([{"tag": "AAAA", "x": 10, "y": 10, "mine": true, "alliance": null}])
	snap["sites"] = [{"id": "farmland:0", "kind": "farmland", "level": 1, "x": 6, "y": 6, "occupied": false, "mine": false}, {"id": "quarry:0", "kind": "quarry", "level": 1, "x": 11, "y": 11, "occupied": false, "mine": false}]
	assert_eq(MapPicker.pick(snap, SIZE, Iso.tile_center(6, 6)), Vector2i(6, 6), "a site is the tile under the finger")
	assert_eq(MapPicker.pick(snap, SIZE, Iso.tile_center(11, 11)), Vector2i(10, 10), "a camp's square is tested before the tile")

func test_a_targets_diamond_is_wider_than_its_tile() -> void:
	var snap := _snap([], [_npc(10, 10)])
	var c := Iso.tile_center(10, 10)
	var half_w := Iso.TILE_W * 0.5 * MapOverlay.NPC_SIZE
	assert_eq(MapPicker.pick(snap, SIZE, c + Vector2(half_w - 2.0, 0)), Vector2i(10, 10), "near the diamond's side tip, beyond the tile's own edge")
	assert_ne(MapPicker.pick(snap, SIZE, c + Vector2(half_w + 20.0, 0)), Vector2i(10, 10), "outside the diamond")

func test_the_level_badge_taps_its_target() -> void:
	var snap := _snap([], [_npc(10, 10)])
	var c := Iso.tile_center(10, 10)
	var half_w := Iso.TILE_W * 0.5 * MapOverlay.NPC_SIZE
	var half_h := Iso.TILE_H * 0.5 * MapOverlay.NPC_SIZE
	var badge := c + Vector2(half_w * 0.62, -half_h * 0.7)
	assert_eq(MapPicker.pick(snap, SIZE, badge + Vector2(5, -5)), Vector2i(10, 10), "on the badge, above the diamond's edge")

func test_an_hq_ring_wins_over_a_target_and_a_target_over_a_camp() -> void:
	var hq := {"tag": "WLF", "x": 10, "y": 10, "mine": true}
	var snap := _snap([], [_npc(10, 10)], [hq])
	assert_eq(MapPicker.pick(snap, SIZE, Iso.tile_center(10, 10)), Vector2i(10, 10))
	var overlap := _snap([{"tag": "AAAA", "x": 10, "y": 10, "mine": false, "alliance": null}], [_npc(11, 11)])
	assert_eq(MapPicker.pick(overlap, SIZE, Iso.tile_center(11, 11)), Vector2i(11, 11), "the target drawn over the camp's far tile wins")
	assert_eq(MapPicker.pick(overlap, SIZE, Iso.tile_center(10, 10)), Vector2i(10, 10), "the camp's own tile still taps the camp")

func test_overlapping_diamonds_give_the_one_drawn_last() -> void:
	# The map's spacing keeps real targets apart; this pins the guard anyway: the later entry is drawn on top.
	var a := _npc(10, 10)
	var b := _npc(11, 10)
	var between := (Iso.tile_center(10, 10) + Iso.tile_center(11, 10)) * 0.5
	var snap := _snap([], [a, b])
	assert_eq(MapPicker.pick(snap, SIZE, between), Vector2i(11, 10), "the later one in the list is drawn on top and wins")
