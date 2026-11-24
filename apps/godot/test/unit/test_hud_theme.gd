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

func test_every_framed_surface_has_a_material_and_corners_that_fit_its_frame() -> void:
	for box: FrameBox in [HudTheme.band(), HudTheme.sheet(), HudTheme.card(), HudTheme.panel(), HudTheme.panel(10.0, 6.0, true), HudTheme.parchment(),
			HudTheme.inset(), HudTheme.button_box("normal"), HudTheme.progress_track()]:
		assert_not_null(box.fill)
		assert_lt(box.edge * 2.0, box.frame.get_size().x, "there is an edge to repeat between the corners")
		assert_gte(box.content_margin_left, 0.0, "margins are set, not taken from the corners")

func test_text_reads_on_every_material() -> void:
	# The brightest texels behind light text, the darkest behind ink (99th percentile), with each surface's own tint.
	for row: Array in [["leather", HudTheme.TEXT_SECOND, true, 1.0], ["leather", HudTheme.LACKING, true, 1.0], ["wood_h", HudTheme.TEXT_SECOND, true, 1.0],
			["leather", HudTheme.TEXT, true, 1.25], ["gold", HudTheme.ON_GOLD, false, 1.0], ["parchment", TilePanel.INK, false, 1.0],
			["parchment", TilePanel.MUTED, false, 1.0], ["parchment", TilePanel.LACKING, false, 1.0]]:
		var image: Image = (load(HudTheme.KIT + "fill_%s.webp" % row[0]) as Texture2D).get_image()
		image.decompress()
		var light: Array = []
		for x in range(0, image.get_width(), 3):
			for y in range(0, image.get_height(), 3):
				light.append(_luminance(image.get_pixel(x, y) * float(row[3])))
		light.sort()
		var worst: float = light[int(light.size() * (0.95 if row[2] else 0.01))]
		var text := _luminance(row[1])
		assert_gt((maxf(text, worst) + 0.05) / (minf(text, worst) + 0.05), 4.5, "%s on %s" % [row[1], row[0]])

func _luminance(c: Color) -> float:
	var l := c.srgb_to_linear()
	return 0.2126 * l.r + 0.7152 * l.g + 0.0722 * l.b

func test_the_switch_is_terracotta_with_a_sand_ring() -> void:
	var box := HudTheme.round_style(HudTheme.TERRACOTTA, HudTheme.RING, HudTheme.SWITCH)
	assert_eq(box.bg_color, HudTheme.TERRACOTTA)
	assert_eq(box.border_color, HudTheme.RING)
	assert_eq(box.corner_radius_top_left, roundi(HudTheme.px(HudTheme.SWITCH) * 0.5), "a circle")

func test_every_painted_piece_loads_and_its_nine_slice_fits_it() -> void:
	for box: StyleBoxTexture in [HudTheme.round_face(), HudTheme.round_face(true), HudTheme.pill(), HudTheme.segment(true), HudTheme.segment(false), HudTheme.progress_fill()]:
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
