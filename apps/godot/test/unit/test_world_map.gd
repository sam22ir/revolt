extends GutTest
## The map builds and draws from a synthetic snapshot that contains everything the mock server's lone guest does
## not: every NPC kind, own and other bases and HQs (valid and invalid tags), own and other marches, and
## liberations (one held, one ended).

const NOW := 1_700_000_000_000

func _snapshot() -> Dictionary:
	var npcs := []
	var i := 0
	for kind in ["patrol", "convoy", "outpost", "fortified_line"]:
		for level in [1, 4]:
			npcs.append({"id": "n%d" % i, "kind": kind, "level": level, "x": 4 + i * 5, "y": 6 + i * 3})
			i += 1
	return {
		"map": "algeria-1",
		"terrainSeed": 12345,
		"size": 64,
		"now": NOW,
		"bases": [
			{"x": 10, "y": 10, "tag": "AAA", "mine": true, "alliance": null},
			{"x": 30, "y": 12, "tag": "BBB", "mine": false, "alliance": "XY"},
		],
		"npcs": npcs,
		"hqs": [
			{"x": 20, "y": 20, "tag": "AB", "mine": true},
			{"x": 40, "y": 40, "tag": "ZZZZ", "mine": false},
			{"x": 5, "y": 50, "tag": "bad tag!", "mine": false},
		],
		"marches": [
			{"id": "m1", "mine": true, "from": {"x": 10, "y": 10}, "to": {"x": 20, "y": 20}},
			{"id": "m2", "mine": false, "from": {"x": 30, "y": 12}, "to": {"x": 40, "y": 40}},
		],
		"rallies": [],
		"liberations": [
			{"region": 5, "from": NOW - 1000, "until": null, "alliance": null},
			{"region": 6, "from": NOW - 5000, "until": NOW - 100, "alliance": null},
		],
	}

func test_builds_and_draws_everything() -> void:
	var map := WorldMap.new()
	add_child_autofree(map)
	await map.build(_snapshot())
	await wait_frames(2)
	assert_gt(map.overlay().draw_count, 0, "the overlay never drew")
	assert_eq(map.size, 64)
	assert_eq(map.liberated.keys(), [5], "only the held region is liberated now")
	assert_gt(map.seam_points.size(), 0)
	assert_true(map.seam_liberated.has(true), "a liberated region should have gold seams")
	assert_eq(map.own_base_tile(), Vector2i(10, 10))

func test_tile_lookups_are_safe_outside_the_map() -> void:
	var map := WorldMap.new()
	add_child_autofree(map)
	await map.build(_snapshot())
	assert_eq(map.region_at_tile(-1, 0), -1)
	assert_eq(map.terrain_at_tile(0, 64), "")
	assert_ne(map.terrain_at_tile(10, 10), "")

func test_a_map_without_own_base_has_no_focus_tile() -> void:
	var snap := _snapshot()
	snap["bases"] = [{"x": 30, "y": 12, "tag": "BBB", "mine": false, "alliance": null}]
	var map := WorldMap.new()
	add_child_autofree(map)
	await map.build(snap)
	assert_eq(map.own_base_tile(), Vector2i(-1, -1))
