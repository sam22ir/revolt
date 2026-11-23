extends GutTest
## The round buttons over a tapped building: what each building offers, the reading order, and where the arch sits on screen.

const W := 1080.0
const TOP := 300.0
const BOTTOM := 1700.0

func after_each() -> void:
	TranslationServer.set_locale("en")

func test_each_building_offers_upgrade_and_info_and_its_own_action() -> void:
	assert_eq(ActionRing.actions_for("farm"), ["upgrade", "info"])
	assert_eq(ActionRing.actions_for("barracks"), ["upgrade", "info", "train"])
	assert_eq(ActionRing.actions_for("hero_hall"), ["upgrade", "info", "heroes"])

func test_arabic_reverses_the_order_so_upgrade_stays_first_in_reading() -> void:
	var ring: ActionRing = add_child_autofree(ActionRing.new())
	ring.show_for("barracks")
	assert_eq(ring.kinds(), ["upgrade", "info", "train"])
	TranslationServer.set_locale("ar")
	ring.show_for("barracks")
	assert_eq(ring.kinds(), ["train", "info", "upgrade"])
	assert_eq(ring.button("upgrade")._label.text, Loc.t("panel.upgrade"))

func test_the_arch_sits_above_a_building_with_room() -> void:
	var c := ActionRing.layout(3, Vector2(540, 900), Vector2(540, 1100), TOP, BOTTOM, W)
	for p: Vector2 in c:
		assert_lt(p.y, 900.0, "above the building")
	assert_lt(c[1].y, c[0].y, "the middle sits highest")
	assert_almost_eq((c[0].x + c[2].x) * 0.5, 540.0, 0.5, "centred on the building")

func test_under_the_hud_the_arch_goes_below_the_building() -> void:
	var c := ActionRing.layout(2, Vector2(540, 320), Vector2(540, 600), TOP, BOTTOM, W)
	for p: Vector2 in c:
		assert_gt(p.y, 600.0, "below the building")
		assert_lt(p.y, BOTTOM)

func test_at_the_screen_edges_the_row_is_kept_on_screen() -> void:
	var cell := ActionRing.CELL.x * HudTheme.SCALE
	for x in [0.0, W]:
		var c := ActionRing.layout(3, Vector2(x, 900), Vector2(x, 1100), TOP, BOTTOM, W)
		assert_gte(c[0].x - cell * 0.5, 0.0, "start edge at %s" % x)
		assert_lte(c[2].x + cell * 0.5, W, "end edge at %s" % x)

func test_the_ring_never_covers_the_hud_or_the_nav_bar() -> void:
	var half := ActionRing.CELL.y * HudTheme.SCALE * 0.5
	# A building panned under the top HUD, and one panned below the nav bar.
	for anchors in [[Vector2(540, 100), Vector2(540, 250)], [Vector2(540, 1800), Vector2(540, 1950)]]:
		for p: Vector2 in ActionRing.layout(3, anchors[0], anchors[1], TOP, BOTTOM, W):
			assert_gte(p.y - half, TOP - 0.01, str(anchors))
			assert_lte(p.y + half, BOTTOM + 0.01, str(anchors))
