extends GutTest
## The grain maths of ground-grain.ts against golden values from the TypeScript (sampled at the indices below), and the
## detail fade of ground-detail.ts. The pebble texture itself is visual only and is not tested pixel by pixel.

const TOL := 1e-6

func _sample(field: PackedFloat32Array, size: int) -> Array:
	return [field[0], field[1], field[7], field[100], field[size * 3 + 5], field[size * size - 1]]

func _assert_samples(actual: Array, expected: Array, label: String) -> void:
	for k in expected.size():
		assert_almost_eq(actual[k], expected[k], TOL, "%s sample %d" % [label, k])

func test_fine_noise_matches_the_client() -> void:
	_assert_samples(_sample(GroundGrain.tileable_noise(256, 8, 12), 256),
		[0.012968409806489944, 0.015292114578187466, 0.0647236555814743, 0.27972787618637085, 0.2176985740661621, 0.05747299641370773], "fine")

func test_coarse_noise_matches_the_client() -> void:
	_assert_samples(_sample(GroundGrain.tileable_noise(256, 32, 11), 256),
		[0.709682822227478, 0.7102905511856079, 0.7356599569320679, 0.27282851934432983, 0.7216001749038696, 0.7073169946670532], "coarse")

func test_detail_noise_matches_the_client() -> void:
	_assert_samples(_sample(GroundGrain.tileable_noise(512, 4, 21), 512),
		[0.16996392607688904, 0.2717839479446411, 0.9402164220809937, 0.04443091154098511, 0.8216103315353394, 0.33740144968032837], "grain")
	_assert_samples(_sample(GroundGrain.tileable_noise(512, 64, 22), 512),
		[0.735424280166626, 0.734893262386322, 0.7110477089881897, 0.07249989360570908, 0.7212876677513123, 0.7352955341339111], "mottle")
	_assert_samples(_sample(GroundGrain.tileable_noise(512, 128, 23), 512),
		[0.27705490589141846, 0.27707958221435547, 0.27822595834732056, 0.3959046006202698, 0.27758240699768066, 0.27713319659233093], "broad")
	_assert_samples(_sample(GroundGrain.tileable_noise(512, 48, 24), 512),
		[0.3225897550582886, 0.3224242925643921, 0.3151673674583435, 0.43104395270347595, 0.3199099004268646, 0.37922146916389465], "gather")

func test_rng_matches_the_client() -> void:
	var r := GroundGrain.Rng.new(31)
	var expected := [0.6722561160568148, 0.8359460374340415, 0.7496604530606419, 0.04891713825054467, 0.41673933155834675, 0.3456277728546411]
	for k in expected.size():
		assert_almost_eq(r.next(), expected[k], TOL, "rng sample %d" % k)

func test_detail_fade_edges() -> void:
	assert_eq(GroundDetail.alpha_at(0.0), 0.0, "below FADE_OUT")
	assert_eq(GroundDetail.alpha_at(0.35), 0.0, "at FADE_OUT")
	assert_almost_eq(GroundDetail.alpha_at(0.475), 0.5, 1e-6, "midway is half")
	assert_eq(GroundDetail.alpha_at(0.6), 1.0, "at FADE_IN")
	assert_eq(GroundDetail.alpha_at(3.0), 1.0, "far above FADE_IN")

func test_zoom_set_before_the_node_enters_the_tree_is_kept() -> void:
	var d := GroundDetail.new()
	d.set_zoom(0.7)
	add_child_autofree(d)
	assert_true(d.visible, "the overlay shows when the zoom was already past FADE_IN before it was added")
	var far := GroundDetail.new()
	far.set_zoom(0.2)
	add_child_autofree(far)
	assert_false(far.visible, "and stays hidden below FADE_OUT")

## The baked PNGs are what the game loads, so they must be exactly what the generators make. If this fails, run
## tools/bake_ground_grain.gd and commit the PNGs.
func _same_pixels(committed_path: String, generated: Image) -> void:
	var committed := Image.new()
	var err := committed.load_png_from_buffer(FileAccess.get_file_as_bytes(committed_path))
	assert_eq(err, OK, "the baked texture decodes: " + committed_path)
	if err != OK:
		return
	committed.convert(Image.FORMAT_RGBA8)
	generated.convert(Image.FORMAT_RGBA8)
	assert_eq(committed.get_size(), generated.get_size(), "size of " + committed_path)
	assert_true(committed.get_data() == generated.get_data(), "stale bake, rerun tools/bake_ground_grain.gd: " + committed_path)

func test_baked_green_grain_is_not_stale() -> void:
	_same_pixels(GroundGrain.GRAIN_PATH, GroundGrain.green_grain())

func test_baked_detail_is_not_stale() -> void:
	_same_pixels(GroundGrain.DETAIL_PATH, GroundGrain.detail_texture())
