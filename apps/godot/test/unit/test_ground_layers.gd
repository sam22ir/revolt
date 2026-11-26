extends GutTest
## Rendering maths of the ground look: SpriteBatch placement, prop ordering and the occupied ring, the zoom threshold.

func _fake_atlas() -> Dictionary:
	var img := Image.create_empty(64, 64, false, Image.FORMAT_RGBA8)
	return {
		"texture": ImageTexture.create_from_image(img),
		"size": Vector2(64, 64),
		"frames": [{"x": 8, "y": 16, "w": 32, "h": 24, "ax": 10, "ay": 20}],
	}

func _placement(sprite: Dictionary) -> Dictionary:
	var atlas := _fake_atlas()
	return SpriteBatch.placement(atlas["frames"][0], sprite, atlas["size"])

func test_anchor_lands_on_the_position() -> void:
	var t: Transform2D = _placement({"frame": 0, "pos": Vector2(100, 200), "scale": 2.0, "flip": false, "alpha": 1.0})["transform"]
	# The frame's anchor in unit-quad coordinates is (ax / w, ay / h).
	var at := t * Vector2(10.0 / 32.0, 20.0 / 24.0)
	assert_almost_eq(at.x, 100.0, 1e-4)
	assert_almost_eq(at.y, 200.0, 1e-4)
	assert_eq(t.x, Vector2(64, 0))
	assert_eq(t.y, Vector2(0, 48))

func test_flip_mirrors_the_anchor_with_the_sprite() -> void:
	var t: Transform2D = _placement({"frame": 0, "pos": Vector2(100, 200), "scale": 2.0, "flip": true, "alpha": 1.0})["transform"]
	var at := t * Vector2(10.0 / 32.0, 20.0 / 24.0)
	assert_almost_eq(at.x, 100.0, 1e-4, "the anchor still lands on the position when mirrored")
	assert_almost_eq(at.y, 200.0, 1e-4)
	assert_lt(t.x.x, 0.0, "a mirrored sprite has a negative x axis")

func test_centered_sprites_use_the_frame_middle() -> void:
	var t: Transform2D = _placement({"frame": 0, "pos": Vector2(0, 0), "scale": 1.0, "flip": false, "alpha": 1.0, "center": true})["transform"]
	var middle := t * Vector2(0.5, 0.5)
	assert_almost_eq(middle.x, 0.0, 1e-4)
	assert_almost_eq(middle.y, 0.0, 1e-4)

func test_instance_data_holds_the_atlas_rectangle_and_alpha() -> void:
	var pl := _placement({"frame": 0, "pos": Vector2.ZERO, "scale": 1.0, "flip": false, "alpha": 0.5})
	var data: Color = pl["custom"]
	assert_almost_eq(data.r, 8.0 / 64.0, 1e-6)
	assert_almost_eq(data.g, 16.0 / 64.0, 1e-6)
	assert_almost_eq(data.b, 32.0 / 64.0, 1e-6)
	assert_almost_eq(data.a, 24.0 / 64.0, 1e-6)
	assert_almost_eq((pl["color"] as Color).a, 0.5, 1e-6)

func _prop(i: int, kind: String = "rocks") -> Dictionary:
	return {"i": i, "kind": kind, "pick": 0.0, "dx": 0.0, "dy": 0.0, "scale": 1.0, "flip": false, "frames": null}

func test_props_are_drawn_in_painters_order() -> void:
	var art := GroundArt.load_art()
	var layer := PropLayer.new()
	add_child_autofree(layer)
	# Tiles (5,5), (1,1), (3,3) on a 64 map: the nearer to the top must be drawn first.
	layer.build(64, [_prop(5 * 64 + 5), _prop(1 * 64 + 1), _prop(3 * 64 + 3)], art, {})
	assert_eq(layer.sorted_sprites.size(), 3)
	var ys := []
	for sp: Dictionary in layer.sorted_sprites:
		ys.append((sp["pos"] as Vector2).y)
	assert_true(ys[0] < ys[1] and ys[1] < ys[2], "sprites should run top to bottom: %s" % [ys])

func test_occupied_tiles_get_no_props() -> void:
	var art := GroundArt.load_art()
	var layer := PropLayer.new()
	add_child_autofree(layer)
	layer.build(64, [_prop(10), _prop(11), _prop(12)], art, {11: true})
	assert_eq(layer.sprite_count(), 2)

func test_props_of_every_kind_resolve_to_a_frame_of_their_own_atlas() -> void:
	var art := GroundArt.load_art()
	var layer := PropLayer.new()
	add_child_autofree(layer)
	var props := []
	for kind in GroundArt.PROP_KINDS:
		props.append(_prop(100, kind))
	layer.build(64, props, art, {})
	assert_eq(layer.sprite_count(), 4)
	# Frames are offset into the packed atlas, so each kind's first frame index is distinct.
	var firsts := {}
	for kind in GroundArt.PROP_KINDS:
		firsts[art.prop_first_frame[kind]] = true
	assert_eq(firsts.size(), 4)

func test_the_map_builds_every_layer_and_props_hide_when_zoomed_out() -> void:
	var map := WorldMap.new()
	add_child_autofree(map)
	var snap := {
		"map": "test", "terrainSeed": 2975369092, "size": 64, "now": 1_700_000_000_000,
		"bases": [{"x": 30, "y": 30, "tag": "AAA", "mine": true, "alliance": null}],
		"npcs": [], "hqs": [], "marches": [], "rallies": [], "liberations": [],
	}
	await map.build(snap)
	assert_gt(map.prop_layer().sprite_count(), 500, "props")
	var occupied := map.occupied_tiles()
	assert_true(occupied.has(30 * 64 + 30) and occupied.has(29 * 64 + 29) and occupied.has(31 * 64 + 31), "the 3x3 ring around a base is kept clear")
	assert_false(occupied.has(32 * 64 + 30))
	map.set_view_zoom(0.3)
	assert_false(map.prop_layer().visible)
	map.set_view_zoom(0.4)
	assert_true(map.prop_layer().visible)

func test_the_packed_props_layout_never_overlaps_and_fits_a_texture() -> void:
	var art := GroundArt.load_art()
	var layout := art.pack_layout()
	var size: Vector2i = layout["size"]
	assert_lte(size.x, 4096)
	assert_lte(size.y, 4096)
	var rects: Array[Rect2i] = []
	for kind in GroundArt.PROP_KINDS:
		var origin: Vector2i = layout[kind]
		var extent := Vector2i(art.atlases[kind]["size"])
		var r := Rect2i(origin, extent)
		assert_true(Rect2i(Vector2i.ZERO, size).encloses(r), "%s fits inside the packed texture" % kind)
		for other in rects:
			assert_false(r.intersects(other), "%s overlaps another atlas" % kind)
		rects.append(r)

func test_packing_releases_the_per_kind_textures() -> void:
	var art := GroundArt.load_art()
	for kind in GroundArt.PROP_KINDS:
		assert_null(art.atlases[kind]["texture"], "%s texture should be released after packing" % kind)
		assert_gt(art.atlases[kind]["frames"].size(), 0)
	assert_not_null(art.props_atlas["texture"])

func test_only_mountains_with_mountains_below_them_rise() -> void:
	# A 4 x 4 map: a mountain block in the top left, one lone mountain tile at the bottom right.
	var size := 4
	var terrain := PackedInt32Array([3, 3, 0, 0, 3, 3, 0, 0, 3, 3, 0, 0, 0, 0, 0, 3])
	var height := PackedFloat32Array()
	for i in size * size:
		height.append(0.9 if terrain[i] == GroundPlan.T_MOUNTAIN else 0.4)
	var up := GroundField.rising(height, terrain, size)
	assert_almost_eq(up[0], GroundField.HELD_HIGH, 1e-6, "inside the block it rises one step: two tiles down is plain")
	assert_almost_eq(up[1 * 4 + 1], GroundField.HELD, 1e-6, "its face would hang over plain land below")
	assert_almost_eq(up[2 * 4 + 0], GroundField.HELD, 1e-6, "the bottom row of the block is held")
	assert_almost_eq(up[3 * 4 + 3], 0.9, 1e-6, "the map's edge has nothing below it")
	assert_almost_eq(up[2], 0.4, 1e-6, "low land is left as it is")

func test_the_feature_field_measures_distance_to_roads_riverbeds_and_pools() -> void:
	var road := [[2.0, 2.0, 1.0], [2.1, 2.0, 1.0], [2.2, 2.0, 1.0]]
	var img := GroundField.features(8, [], [road], [Vector2i(6, 6)])
	assert_eq(img.get_size(), Vector2i(8, 8) * GroundField.detail(8))
	var on_road := img.get_pixel(2 * GroundField.detail(8), 2 * GroundField.detail(8))
	var away := img.get_pixel(5 * GroundField.detail(8), 1 * GroundField.detail(8))
	assert_lt(on_road.r, 0.15, "on the road")
	assert_eq(away.r, 1.0, "far from it")
	assert_eq(on_road.g, 1.0, "no riverbed anywhere")
	assert_lt(img.get_pixel(6 * GroundField.detail(8) + 4, 6 * GroundField.detail(8) + 4).b, 0.05, "the pool's middle")

func test_the_land_field_keeps_roads_low_and_is_smooth_between_tiles() -> void:
	var size := 8
	var terrain := PackedInt32Array()
	var height := PackedFloat32Array()
	var fertility := PackedFloat32Array()
	var bytes := PackedByteArray()
	var flags := PackedByteArray()
	for i in size * size:
		terrain.append(GroundPlan.T_MOUNTAIN)
		height.append(0.95)
		fertility.append(0.5)
		bytes.append(0)
		flags.append(Geography.GEO_ROAD if i == 3 * size + 3 else 0)
	var img := GroundField.land(size, height, terrain, fertility, bytes, bytes, flags)
	assert_eq(img.get_size(), Vector2i(size, size) * GroundField.detail(8))
	var road := img.get_pixel(3 * GroundField.detail(8) + 4, 3 * GroundField.detail(8) + 4)
	assert_lt(road.r, MapGrid.HILLS_FROM, "a road's tile is low")
	assert_lt(road.g, MapGrid.MOUNTAIN_FROM, "and does not rise")

func test_a_road_over_a_mountain_keeps_the_faces_off_it() -> void:
	# A 6 x 6 mountain with a road along its fourth row.
	var size := 6
	var terrain := PackedInt32Array()
	var height := PackedFloat32Array()
	var flags := PackedByteArray()
	for i in size * size:
		terrain.append(GroundPlan.T_MOUNTAIN)
		height.append(0.95)
		flags.append(Geography.GEO_ROAD if i / size == 3 else 0)
	var up := GroundField.rising(height, terrain, size, flags)
	assert_almost_eq(up[2 * size + 2], GroundField.HELD, 1e-6, "the row above the road does not rise")
	assert_almost_eq(up[1 * size + 2], GroundField.HELD_HIGH, 1e-6, "two rows above only one step")
	assert_almost_eq(up[0 * size + 2], 0.95, 1e-6, "farther up it rises fully")
	assert_almost_eq(up[5 * size + 2], 0.95, 1e-6, "below the road it rises")
