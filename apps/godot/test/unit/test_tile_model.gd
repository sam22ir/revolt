extends GutTest
## TileModel against `tileInfo` (data/tile-fixtures.json), and the panel's view: titles, levels, the defenders, and player text that
## stays literal.

func after_each() -> void:
	TranslationServer.set_locale("en")

func _fixtures() -> Dictionary:
	var parsed := JSON.new()
	assert_eq(parsed.parse(FileAccess.get_file_as_string("res://data/tile-fixtures.json")), OK)
	return parsed.data

func test_every_fixture_tile_matches_the_client() -> void:
	var f := _fixtures()
	var snap: Dictionary = f["snapshot"]
	var cases: Array = f["cases"]
	assert_gt(cases.size(), 15)
	for c: Dictionary in cases:
		var info := TileModel.info(snap, int(c["x"]), int(c["y"]), "plain")
		var label := "tile %s,%s" % [c["x"], c["y"]]
		assert_eq(info["kind"], c["kind"], label + " kind")
		if c["base"] != null:
			assert_eq(info["base"]["tag"], c["base"], label)
		if c["hq"] != null:
			assert_eq(info["hq"]["tag"], c["hq"], label)
		if c["npc"] != null:
			assert_eq(info["npc"]["id"], c["npc"], label)
			assert_eq(info["def"] != null, c["has_def"], label + " definition")
			if c["has_def"]:
				assert_eq(info["def"]["rallyOnly"], c["rally_only"], label + " rally only")

func test_a_base_wins_over_an_hq_and_an_hq_over_a_target() -> void:
	var snap: Dictionary = _fixtures()["snapshot"]
	assert_eq(TileModel.info(snap, 12, 12, "plain")["kind"], "camp", "base and HQ on one tile")
	assert_eq(TileModel.info(snap, 13, 13, "plain")["kind"], "hq", "HQ and target on one tile")

func test_a_site_tile_resolves_after_a_base_an_hq_and_a_target() -> void:
	var snap := {
		"bases": [{"x": 1, "y": 1, "tag": "AAAA", "mine": false, "alliance": null}],
		"hqs": [{"x": 2, "y": 2, "tag": "AB", "mine": false}],
		"npcs": [{"id": "n1", "kind": "patrol", "level": 1, "x": 3, "y": 3}],
		"sites": [
			{"id": "farmland:0", "kind": "farmland", "level": 1, "x": 1, "y": 1, "occupied": false, "mine": false},
			{"id": "farmland:1", "kind": "farmland", "level": 2, "x": 2, "y": 2, "occupied": false, "mine": false},
			{"id": "quarry:0", "kind": "quarry", "level": 3, "x": 3, "y": 3, "occupied": true, "mine": true},
			{"id": "quarry:1", "kind": "quarry", "level": 3, "x": 4, "y": 4, "occupied": true, "mine": false},
		],
	}
	assert_eq(TileModel.info(snap, 1, 1, "plain")["kind"], "camp", "a base over a site")
	assert_eq(TileModel.info(snap, 2, 2, "plain")["kind"], "hq", "an HQ over a site")
	assert_eq(TileModel.info(snap, 3, 3, "plain")["kind"], "npc", "a target over a site")
	var site: Dictionary = TileModel.info(snap, 4, 4, "plain")
	assert_eq([site["kind"], site["site"]["id"], site["terrain"]], ["site", "quarry:1", "plain"])
	assert_eq(TileModel.info(snap, 5, 5, "plain")["kind"], "empty", "no site and nothing else")

func test_the_view_of_each_kind() -> void:
	var snap: Dictionary = _fixtures()["snapshot"]
	var own := TileModel.view(TileModel.info(snap, 2, 2, "plain"), 2, 2, "")
	assert_eq(own["title"], Loc.t("map.ownCamp"))
	var npc := TileModel.view(TileModel.info(snap, 8, 8, "plain"), 8, 8, "")
	assert_eq(npc["title"], Loc.t("npc.patrol.name"))
	assert_eq(npc["level"], 1)
	assert_true(npc["defenders"] is Dictionary)
	assert_false(npc["rally_only"])
	var fort := TileModel.view(TileModel.info(snap, 11, 8, "plain"), 11, 8, "")
	assert_true(fort["rally_only"], "the fortified line needs a rally")
	var unknown := TileModel.view(TileModel.info(snap, 10, 10, "plain"), 10, 10, "")
	assert_null(unknown["defenders"], "a level the table does not know has no defenders to show")
	var land := TileModel.view(TileModel.info(snap, 0, 0, "hills"), 0, 0, "")
	assert_eq(land["title"], Loc.t("terrain.hills"))
	assert_eq(land["desc"], Loc.t("map.nothingHere"))
	var hq := TileModel.view(TileModel.info(snap, 4, 4, "plain"), 4, 4, "Wolves")
	assert_eq(hq["alliance_name"], "Wolves", "the player's own HQ shows their alliance")
	var other := TileModel.view(TileModel.info(snap, 13, 13, "plain"), 13, 13, "Wolves")
	assert_eq(other["alliance_name"], "", "another HQ never shows a name")

func test_player_text_in_a_title_stays_literal() -> void:
	var snap := {"bases": [{"tag": "ABCD", "x": 1, "y": 1, "mine": false, "alliance": "{tag} {alliance}"}], "hqs": [], "npcs": []}
	var v := TileModel.view(TileModel.info(snap, 1, 1, "plain"), 1, 1, "")
	assert_true(v["title"].contains("{tag} {alliance}"), "the alliance name is placed as it is: %s" % v["title"])
	assert_true(v["title"].contains("ABCD"))

func test_a_camp_without_an_alliance_uses_the_plain_title() -> void:
	var snap := {"bases": [{"tag": "ABCD", "x": 1, "y": 1, "mine": false, "alliance": null}], "hqs": [], "npcs": []}
	assert_eq(TileModel.view(TileModel.info(snap, 1, 1, "plain"), 1, 1, "")["title"], Loc.t("map.camp", {"tag": "ABCD"}))

func test_the_coordinates_use_the_language_digits() -> void:
	var v := TileModel.view({"kind": "empty", "terrain": "plain"}, 1234, 5, "")
	assert_eq(v["coords"], Loc.t("map.coords", {"x": Fmt.amount("en", 1234), "y": "5"}))

func test_only_a_target_that_is_not_rally_only_can_be_marched_on() -> void:
	var snap: Dictionary = _fixtures()["snapshot"]
	assert_true(TileModel.view(TileModel.info(snap, 8, 8, "plain"), 8, 8, "")["can_march"], "a patrol")
	assert_false(TileModel.view(TileModel.info(snap, 11, 8, "plain"), 11, 8, "")["can_march"], "the fortified line needs a rally")
	assert_true(TileModel.view(TileModel.info(snap, 10, 10, "plain"), 10, 10, "")["can_march"], "a level the table does not know: the server decides, as in the Phaser panel")
	assert_false(TileModel.view(TileModel.info(snap, 2, 2, "plain"), 2, 2, "")["can_march"], "your own camp")
	assert_false(TileModel.view(TileModel.info(snap, 0, 0, "hills"), 0, 0, "")["can_march"], "empty land")

func test_only_the_ranks_the_rules_name_may_place_the_hq() -> void:
	assert_true(TileModel.can_place_hq("leader"))
	assert_false(TileModel.can_place_hq("officer"))
	assert_false(TileModel.can_place_hq("member"))
	assert_false(TileModel.can_place_hq(""))

func test_the_hq_button_says_move_once_the_alliance_has_one() -> void:
	assert_eq(TileModel.hq_button_key({"hqs": []}), "map.placeHq")
	assert_eq(TileModel.hq_button_key({"hqs": [{"mine": false, "x": 1, "y": 1}]}), "map.placeHq", "another alliance's HQ is not yours")
	assert_eq(TileModel.hq_button_key({"hqs": [{"mine": true, "x": 1, "y": 1}]}), "map.moveHq")

## A resource site's panel (docs/resource-sites-plan.md, chunk 4): the three holder states, and Recall only while your march is at it.
func _site_snap(site: Dictionary) -> Dictionary:
	return {"bases": [], "hqs": [], "npcs": [], "sites": [site]}

func _site(extra := {}) -> Dictionary:
	var s := {"id": "quarry:0", "kind": "quarry", "level": 3, "x": 13, "y": 14, "occupied": false, "mine": false}
	s.merge(extra, true)
	return s

func _own_march(stage_at: Dictionary) -> Dictionary:
	var m := {"id": "m1", "siteId": "quarry:0", "from": {"x": 10, "y": 10}, "to": {"x": 13, "y": 14}, "departAt": 0.0, "arriveAt": 1000.0,
		"leaveSiteAt": 9000.0, "returnAt": 12000.0, "outcome": null}
	m.merge(stage_at, true)
	return m

func _site_view(site: Dictionary, marches: Array, now: float) -> Dictionary:
	var info := TileModel.info(_site_snap(site), 13, 14, "plain")
	return TileModel.view(info, 13, 14, "", marches, now)

func test_a_free_site_offers_harvest_and_says_so() -> void:
	var v := _site_view(_site(), [], 5000.0)
	assert_eq(String(v["title"]), Loc.t("site.quarry.name"))
	assert_eq(int(v["level"]), 3)
	assert_eq(v["harvest_action"], "harvest")
	assert_eq(v["recall_march"], "")
	assert_eq(v["lines"][2], Loc.t("harvest.free"))
	assert_eq(v["lines"][1], Loc.t("harvest.rateLine", {"rate": Fmt.amount(Fmt.lang(), 700)}), "700 per hour at level 3")
	assert_eq(v["lines"][0], Loc.t("harvest.resourceLine", {"resource": Loc.t("resource.materiel")}))
	assert_false(bool(v["can_march"]), "a site is not a target")

func test_a_site_held_by_another_player_offers_nothing() -> void:
	var v := _site_view(_site({"occupied": true}), [], 5000.0)
	assert_eq(v["harvest_action"], "")
	assert_eq(v["recall_march"], "")
	assert_eq(v["lines"][2], Loc.t("harvest.taken"))

func test_your_site_offers_recall_only_while_your_march_is_at_it() -> void:
	var mine := _site({"occupied": true, "mine": true})
	var at := _site_view(mine, [_own_march({})], 5000.0)
	assert_eq(at["harvest_action"], "recall")
	assert_eq(at["recall_march"], "m1")
	assert_eq(at["lines"][2], Loc.t("harvest.mine"))

func test_your_site_offers_no_recall_before_arrival_or_after_the_leave_time() -> void:
	var mine := _site({"occupied": true, "mine": true})
	var walking := _site_view(mine, [_own_march({})], 500.0)
	assert_eq(walking["harvest_action"], "", "still on the way out")
	assert_eq(walking["lines"][2], Loc.t("harvest.mine"), "the holder line still says it is yours")
	var leaving := _site_view(mine, [_own_march({})], 9000.0)
	assert_eq(leaving["harvest_action"], "", "its leave time has come")
	assert_eq(leaving["recall_march"], "")

func test_a_march_of_yours_on_the_site_counts_even_when_the_snapshot_lags() -> void:
	var v := _site_view(_site(), [_own_march({})], 5000.0)
	assert_eq(v["harvest_action"], "recall", "the base's march says it is yours, whatever the snapshot's flags")

func test_a_march_that_has_come_home_no_longer_holds_the_site() -> void:
	var v := _site_view(_site(), [_own_march({})], 13000.0)
	assert_eq(v["harvest_action"], "harvest", "back home at 12 000: the site is free again")
