extends GutTest
## The base layout maths and the number and countdown text must reproduce the TypeScript (data/base-fixtures.json).

const FIXTURES := "res://data/base-fixtures.json"
const TOL := 1e-9

func after_each() -> void:
	TranslationServer.set_locale("en")

func _fx() -> Dictionary:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(FIXTURES))
	assert_true(parsed is Dictionary, "fixtures missing")
	return parsed

func test_grid_constants_match() -> void:
	var l: Dictionary = _fx()["layout"]
	assert_eq(BaseLayout.TILE_W, float(l["tileW"]))
	assert_eq(BaseLayout.TILE_H, float(l["tileH"]))
	assert_eq(BaseLayout.GRID_SIZE, int(l["gridSize"]))
	assert_eq(BaseLayout.WORLD_WIDTH, float(l["mapWorldWidth"]))
	assert_eq(BaseLayout.WORLD_HEIGHT, float(l["mapWorldHeight"]))
	assert_almost_eq(float(BaseLayout.map_center()["y"]), float(l["mapCenter"]["y"]), TOL)

func test_every_building_is_placed_as_in_the_client() -> void:
	var l: Dictionary = _fx()["layout"]
	assert_eq(l["buildings"].size(), Balance.data()["buildingIds"].size(), "a plot for every building")
	for b: Dictionary in l["buildings"]:
		var id: String = b["id"]
		assert_eq(BaseLayout.sprite_key(id), b["key"])
		var plot := BaseLayout.plot(id)
		assert_almost_eq(float(plot["gx"]), float(b["plot"]["gx"]), TOL, id + " gx")
		assert_almost_eq(float(plot["gy"]), float(b["plot"]["gy"]), TOL, id + " gy")
		assert_almost_eq(float(plot["size"]), float(b["plot"]["size"]), TOL, id + " size")
		var c := BaseLayout.plot_center(plot)
		assert_almost_eq(float(c["x"]), float(b["plotCenter"]["x"]), TOL, id + " centre x")
		assert_almost_eq(float(c["y"]), float(b["plotCenter"]["y"]), TOL, id + " centre y")
		var corners := BaseLayout.footprint(plot)
		for i in 4:
			assert_almost_eq(corners[i].x, float(b["footprint"][i]["x"]), 1e-3, "%s corner %d x" % [id, i])
			assert_almost_eq(corners[i].y, float(b["footprint"][i]["y"]), 1e-3, "%s corner %d y" % [id, i])
		var info: Dictionary = BaseLayout.manifest()[b["key"]]
		var p := BaseLayout.place_sprite(plot, info)
		for k in ["x", "y", "scale", "height"]:
			assert_almost_eq(float(p[k]), float(b["placement"][k]), TOL, "%s %s" % [id, k])

func test_the_ground_slab_is_placed_as_in_the_client() -> void:
	var g: Dictionary = _fx()["layout"]["ground"]
	assert_eq(BaseLayout.GROUND_KEY, g["key"])
	var p := BaseLayout.place_ground(BaseLayout.manifest()[BaseLayout.GROUND_KEY])
	for k in ["x", "y", "sx", "sy"]:
		assert_almost_eq(float(p[k]), float(g["placement"][k]), TOL, k)

func _span() -> float:
	var sprites := []
	for id: String in Balance.data()["buildingIds"]:
		var info: Dictionary = BaseLayout.manifest()[BaseLayout.sprite_key(id)]
		var p := BaseLayout.place_sprite(BaseLayout.plot(id), info)
		sprites.append({"x": p["x"], "width": float(info["w"]) * float(p["scale"])})
	return BaseLayout.span(sprites)

func test_span_and_camera_fit_match() -> void:
	var l: Dictionary = _fx()["layout"]
	assert_almost_eq(_span(), float(l["span"]), TOL, "span")
	for f: Dictionary in l["fits"]:
		var got := BaseLayout.fit(float(f["w"]), float(f["h"]), float(f["px"]), float(f["top"]), float(f["nav"]), _span())
		assert_almost_eq(float(got["zoom"]), float(f["zoom"]), TOL, "zoom for %s" % [f])
		assert_almost_eq(float(got["cx"]), float(f["cx"]), TOL, "cx")
		assert_almost_eq(float(got["cy"]), float(f["cy"]), TOL, "cy for %s" % [f])

func test_numbers_match_the_client_text() -> void:
	for lang in ["en", "ar"]:
		for pair: Array in _fx()["format"][lang]["amounts"]:
			assert_eq(Fmt.amount(lang, float(pair[0])), pair[1], "%s amount %s" % [lang, pair[0]])

func test_countdowns_match_the_client_text() -> void:
	for lang in ["en", "ar"]:
		TranslationServer.set_locale(lang)
		for pair: Array in _fx()["format"][lang]["durations"]:
			assert_eq(Fmt.duration(float(pair[0])), pair[1], "%s duration %s ms" % [lang, pair[0]])

func test_french_numbers_use_a_space_the_font_has() -> void:
	assert_eq(Fmt.amount("fr", 1234567.0), "1 234 567")
