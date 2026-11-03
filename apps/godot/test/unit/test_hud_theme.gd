extends GutTest
## The bronze HUD's values (docs/godot-visuals-plan.md), scaled from mockup px to the viewport.

func test_the_palette() -> void:
	assert_eq(HudTheme.PANEL, Color(40.0 / 255.0, 39.0 / 255.0, 35.0 / 255.0, 0.92))
	assert_eq(HudTheme.BRASS, Color("a8834f"))
	assert_eq(HudTheme.TEXT, Color("e8d5b0"))
	assert_eq(HudTheme.TEXT_SECOND, Color("bfa77c"))
	assert_eq(HudTheme.TERRACOTTA, Color("b5532f"))
	assert_eq(HudTheme.RING, Color("e2c07a"))
	assert_eq(HudTheme.ALERT, Color("d9462b"))
	assert_eq(HudTheme.GOLD, Color("f0c060"))
	assert_eq(HudTheme.OLIVE, Color("6b7a3a"))

func test_mockup_px_scale_to_the_viewport_width() -> void:
	assert_almost_eq(HudTheme.px(375.0), 1080.0, 1e-6, "the whole phone width is the whole viewport")
	assert_almost_eq(HudTheme.px(HudTheme.SWITCH), 66.0 * 1080.0 / 375.0, 1e-6)

func test_the_panel_is_a_dark_box_with_a_thin_brass_border() -> void:
	var box := HudTheme.panel()
	assert_eq(box.bg_color, HudTheme.PANEL)
	assert_eq(box.border_color, HudTheme.BRASS)
	assert_eq(box.corner_radius_top_left, roundi(HudTheme.px(HudTheme.RADIUS)))
	assert_lt(box.border_width_left, 6, "a hairline, not a frame")

func test_the_switch_is_terracotta_with_a_sand_ring() -> void:
	var box := HudTheme.round_style(HudTheme.TERRACOTTA, HudTheme.RING, HudTheme.SWITCH)
	assert_eq(box.bg_color, HudTheme.TERRACOTTA)
	assert_eq(box.border_color, HudTheme.RING)
	assert_eq(box.corner_radius_top_left, roundi(HudTheme.px(HudTheme.SWITCH) * 0.5), "a circle")

func test_every_painted_piece_loads_and_its_nine_slice_fits_it() -> void:
	for box: StyleBoxTexture in [HudTheme.band(), HudTheme.round_face(), HudTheme.round_face(true), HudTheme.build().get_stylebox("normal", "Button")]:
		assert_not_null(box.texture)
		var size := box.texture.get_size()
		assert_lt(box.texture_margin_left + box.texture_margin_right, size.x)
		assert_lt(box.texture_margin_top + box.texture_margin_bottom, size.y)

func test_the_theme_styles_panels_and_buttons() -> void:
	var theme := HudTheme.build()
	assert_true(theme.has_stylebox("panel", "PanelContainer"))
	assert_true(theme.has_stylebox("normal", "Button"))
	assert_eq(theme.get_color("font_color", "Label"), HudTheme.TEXT)

func test_every_icon_of_the_set_loads() -> void:
	for id in HudIcon.NAMES:
		assert_not_null(HudIcon.load_texture(id), id)
