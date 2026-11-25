extends GutTest
## The map's pieces: every post, site and camp has a picture that loads and stands round its footprint.

func _names() -> Array:
	var out: Array = ["base", "alliance_hq", "patrol", "convoy", "outpost", "fortified_line"]
	for kind: String in ["farmland", "quarry"]:
		for level in range(1, 4):
			out.append(MapArt.site(kind, level))
	return out

func test_every_piece_loads_at_the_size_its_data_says() -> void:
	for name: String in _names():
		assert_true(MapArt.has(name), name)
		var rect := MapArt.rect(name, Vector2(1000, 500))
		assert_almost_eq(MapArt.texture(name).get_size() / MapArt.SCALE, rect.size, Vector2.ONE * 0.01, name)
		assert_true(rect.has_point(Vector2(1000, 500)), "%s is round its centre" % name)

func test_every_post_the_rules_know_has_a_picture() -> void:
	for row: Dictionary in Balance.data()["npcLevels"]:
		assert_true(MapArt.has(row["kind"]), row["kind"])

func test_an_odd_site_level_still_has_a_picture() -> void:
	assert_eq(MapArt.site("quarry", 0), "quarry_1")
	assert_eq(MapArt.site("quarry", 9), "quarry_3")
	assert_false(MapArt.has("nothing"))
