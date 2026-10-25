extends GutTest
## The look-test ground variants: pure numbers on top of the unchanged Phaser plan.

func after_each() -> void:
	GroundStyle.set_active("classic")

func _flat(size: int, rgb: int) -> PackedInt32Array:
	var out := PackedInt32Array()
	out.resize(size * size)
	out.fill(rgb)
	return out

func _fertility(size: int, value: float) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(size * size)
	out.fill(value)
	return out

func _luma(c: int) -> float:
	return 0.3 * ((c >> 16) & 0xff) + 0.59 * ((c >> 8) & 0xff) + 0.11 * (c & 0xff)

func test_unknown_values_are_classic_and_classic_has_no_numbers() -> void:
	assert_eq(GroundStyle.parse("nonsense"), "classic")
	assert_eq(GroundStyle.parse(""), "classic")
	GroundStyle.set_active("zz")
	assert_true(GroundStyle.is_classic())
	assert_true(GroundStyle.params().is_empty())

func test_a_b_and_c_have_every_number() -> void:
	var keys := ["sand", "ochre", "olive", "cell", "ochre_amount", "olive_amount", "keep", "decal_min_luma", "decal_alpha", "prop_keep", "prop_alpha", "prop_size", "prop_spread", "wash", "detail", "seam", "seam_width", "dash", "background", "fade"]
	for variant in ["a", "b", "c"]:
		GroundStyle.set_active(variant)
		for key: String in keys:
			assert_true(GroundStyle.params().has(key), "%s.%s" % [variant, key])

func test_the_sand_is_light_and_close_to_the_approved_colour() -> void:
	for variant in ["a", "b", "c"]:
		var sand: Color = GroundStyle.STYLES[variant]["sand"]
		assert_gt(_luma(sand.to_rgba32() >> 8), 180.0, "%s is a light sand" % variant)
	assert_eq(GroundStyle.STYLES["a"]["sand"], Color("dcc69c"))

func test_restyling_lightens_a_dark_forest_and_is_deterministic() -> void:
	var dark := _flat(32, 0x6b5e34)
	var fertility := _fertility(32, 0.6)
	for variant in ["a", "b", "c"]:
		var look: Dictionary = GroundStyle.STYLES[variant]
		var out := GroundStyle.restyle(dark, 32, fertility, look)
		assert_eq(out.size(), dark.size())
		for i in [0, 100, 500, 1023]:
			assert_gt(_luma(out[i]), _luma(dark[i]) + 40.0, "%s tile %d" % [variant, i])
		assert_eq(GroundStyle.restyle(dark, 32, fertility, look), out, "same input, same field")

func test_the_tints_are_soft_not_blotchy() -> void:
	var out := GroundStyle.restyle(_flat(48, 0xc99c60), 48, _fertility(48, 0.3), GroundStyle.STYLES["a"])
	var lo := 255.0
	var hi := 0.0
	for c in out:
		lo = minf(lo, _luma(c))
		hi = maxf(hi, _luma(c))
	assert_lt(hi - lo, 45.0, "the whole field stays within a narrow band")

func test_only_light_decals_pass_the_filter() -> void:
	var look: Dictionary = GroundStyle.STYLES["a"]
	assert_false(GroundStyle.decal_allowed(5, look), "frame 5 is the darkest blotch")
	assert_false(GroundStyle.decal_allowed(7, look))
	assert_true(GroundStyle.decal_allowed(11, look), "frame 11 is the lightest")
	assert_false(GroundStyle.decal_allowed(99, look), "no such frame")
	assert_eq(GroundStyle.DECAL_LUMA.size(), 17, "one per frame of the decal atlas")

func test_the_prop_filter_keeps_roughly_the_stated_share_and_never_changes() -> void:
	var look: Dictionary = GroundStyle.STYLES["a"]
	var kept := 0
	for y in 100:
		for x in 100:
			if GroundStyle.prop_kept(x, y, look):
				kept += 1
	assert_almost_eq(kept / 10000.0, float(look["prop_keep"]), 0.03)
	assert_eq(GroundStyle.prop_kept(7, 9, look), GroundStyle.prop_kept(7, 9, look))

func test_prop_sizes_move_toward_one_family() -> void:
	var look: Dictionary = GroundStyle.STYLES["a"]
	var small := GroundStyle.prop_scale(0.7, look)
	var large := GroundStyle.prop_scale(1.3, look)
	assert_lt(large - small, 0.6 * float(look["prop_size"]), "the spread is narrower than the plan's")
	assert_gt(GroundStyle.prop_scale(1.0, look), 1.0, "and a little larger overall")
