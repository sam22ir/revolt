extends GutTest
## The shared screen pieces: portraits are cut around each building on the painting, chips mark a lacking cost, the arrow
## follows the reading direction, and the sheet's model carries the next level's storage.

func after_each() -> void:
	TranslationServer.set_locale("en")

func test_each_portrait_is_a_square_around_its_building_on_the_painting() -> void:
	for id: String in CampLayout.REGIONS:
		var region := UiKit.portrait_region(id)
		assert_almost_eq(region.size.x, region.size.y, 0.01, id)
		var point: Vector2 = CampLayout.REGIONS[id]["point"] * 2.0
		assert_true(region.has_point(point), "%s holds its building" % id)
		var tex := UiKit.portrait_texture(id) as AtlasTexture
		assert_true(Rect2(Vector2.ZERO, CampModels.SIZE).encloses(tex.region), "%s stays on the painting" % id)

func test_a_lacking_cost_is_marked() -> void:
	var ok := UiKit.cost_chip("food", "70", false)
	var short := UiKit.cost_chip("food", "70", true)
	var ok_label := ok.find_children("*", "Label", true, false)[0] as Label
	var short_label := short.find_children("*", "Label", true, false)[0] as Label
	assert_eq(short_label.get_theme_color("font_color"), HudTheme.LACKING)
	assert_ne(ok_label.get_theme_color("font_color"), HudTheme.LACKING)
	ok.free()
	short.free()

func test_the_arrow_points_the_reading_way() -> void:
	assert_eq(UiKit.arrow(), "→")
	TranslationServer.set_locale("ar")
	assert_eq(UiKit.arrow(), "←")

func test_the_command_post_sheet_shows_the_next_storage() -> void:
	var levels := {"hq": 1, "farm": 1, "armory": 1, "treasury": 1, "barracks": 1, "hero_hall": 1}
	var rich := {"food": 9999.0, "materiel": 9999.0, "funds": 9999.0, "support": 0.0}
	var m := BuildingPanelModel.build("hq", levels, rich, null, 0)
	assert_eq(m["next"]["storage"], int(Balance.storage_cap(2)["food"]))
	assert_gt(int(m["next"]["storage"]), int(m["storage"]))
	assert_null(BuildingPanelModel.build("farm", levels, rich, null, 0)["next"]["storage"])
