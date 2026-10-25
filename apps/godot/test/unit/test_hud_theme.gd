extends GutTest
## The code-drawn HUD keeps the approved mockup's exact values (docs/godot-visuals-plan.md), scaled from mockup px to the viewport.

func test_the_colours_are_the_approved_mockups() -> void:
	assert_eq(HudTheme.PANEL, Color(38.0 / 255.0, 29.0 / 255.0, 22.0 / 255.0, 0.9))
	assert_eq(HudTheme.BRASS, Color("b08d57"))
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

func test_the_theme_styles_panels_and_buttons() -> void:
	var theme := HudTheme.build()
	assert_true(theme.has_stylebox("panel", "PanelContainer"))
	assert_true(theme.has_stylebox("normal", "Button"))
	assert_eq(theme.get_color("font_color", "Label"), HudTheme.TEXT)

func test_every_icon_of_the_set_loads() -> void:
	for id in HudIcon.NAMES:
		assert_not_null(HudIcon.load_texture(id), id)
