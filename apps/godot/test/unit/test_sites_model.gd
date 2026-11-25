extends GutTest
## SitesModel: the snapshot's resolved resource sites, read tolerantly. Nothing here places a site (the server does).

func _site(id: String, kind: String, x: int, y: int, level := 1, occupied := false, mine := false) -> Dictionary:
	return {"id": id, "kind": kind, "level": level, "x": x, "y": y, "occupied": occupied, "mine": mine}

func test_sites_come_back_sorted_by_id() -> void:
	var snap := {"sites": [_site("quarry:1", "quarry", 3, 3), _site("farmland:10", "farmland", 2, 2), _site("farmland:0", "farmland", 1, 1)]}
	var ids := SitesModel.sites(snap).map(func(s: Dictionary) -> String: return s["id"])
	assert_eq(ids, ["farmland:0", "farmland:10", "quarry:1"])

func test_a_snapshot_without_sites_has_none() -> void:
	assert_eq(SitesModel.sites({}), [])
	assert_eq(SitesModel.sites({"sites": null}), [])
	assert_eq(SitesModel.sites({"sites": "farmland"}), [])
	assert_eq(SitesModel.site_at({}, 1, 1), {})

func test_malformed_entries_are_skipped_not_drawn() -> void:
	var snap := {"sites": [
		"junk",
		{"id": "x"},
		_site("farmland:0", "farmland", 1, 1, 4),
		_site("mine:1", "mine", 1, 1),
		_site("farmland:2", "farmland", 2, 2, 2),
		{"id": "farmland:3", "kind": "farmland", "level": 1, "x": "a", "y": 2},
	]}
	var got := SitesModel.sites(snap)
	assert_eq(got.size(), 1)
	assert_eq(got[0]["id"], "farmland:2")

func test_site_at_finds_the_tile_or_nothing() -> void:
	var snap := {"sites": [_site("quarry:0", "quarry", 4, 5, 3)]}
	assert_eq(SitesModel.site_at(snap, 4, 5)["id"], "quarry:0")
	assert_eq(SitesModel.site_at(snap, 5, 4), {})

func test_state_is_mine_then_taken_then_free() -> void:
	assert_eq(SitesModel.state_of(_site("a", "farmland", 0, 0, 1, true, true)), "mine")
	assert_eq(SitesModel.state_of(_site("a", "farmland", 0, 0, 1, true, false)), "taken")
	assert_eq(SitesModel.state_of(_site("a", "farmland", 0, 0)), "free")

func test_each_kind_yields_its_resource() -> void:
	assert_eq(SitesModel.kind_resource("farmland"), "food")
	assert_eq(SitesModel.kind_resource("quarry"), "materiel")
	assert_eq(SitesModel.kind_resource("mine"), "")

func test_the_badge_text_is_the_plain_level() -> void:
	assert_eq(SitesModel.label(_site("q", "quarry", 0, 0, 3)), "3")
