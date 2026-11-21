extends GutTest
## The base picture in 3D: every building is in it, the figures stand where CampLife puts them, and the render keeps the
## painting's shape and covers exactly the painting's rectangle, so the outlines traced on the painting still fit.

const NOW := 5_000_000

func _scene() -> CampScene:
	var scene := CampScene.new()
	scene.build()
	add_child_autofree(scene)
	return scene

func test_every_building_is_in_the_scene() -> void:
	var scene := _scene()
	for id: String in CampModels.PLACES:
		var found := false
		for child: Node in scene.get_children():
			found = found or child.name == id
		assert_true(found, id)

func test_a_building_shows_where_it_was_measured_on_the_painting() -> void:
	for id: String in CampModels.PLACES:
		var corner: Vector2 = CampModels.PLACES[id]["corner"]
		assert_almost_eq(CampModels.painting_px(CampModels.ground_at(corner)), corner, Vector2.ONE * 0.01, id)

func test_each_figure_stands_where_camp_life_puts_it() -> void:
	var scene := _scene()
	var list := CampLife.figures(NOW)
	assert_eq(scene.figure_count(), list.size())
	scene.tick(NOW)
	for i in list.size():
		assert_almost_eq(scene.figure_px(i), (list[i]["at"] as Vector2) * 2.0, Vector2.ONE * 0.01, str(list[i]))
	scene.tick(NOW + 7000)
	assert_ne(scene.figure_px(0), (list[0]["at"] as Vector2) * 2.0, "time moves them")

func test_the_render_keeps_the_painting_shape_at_any_size() -> void:
	var scene := _scene()
	for want: Vector2 in [Vector2(360, 645), Vector2(1080, 1935.5), Vector2(5000, 9000), Vector2(1, 1), Vector2(1200, 900)]:
		scene.set_render_size(want)
		assert_eq(scene.size.x * 43, scene.size.y * 24, str(want))
		assert_true(scene.size.x <= int(CampModels.SIZE.x) and scene.size.x >= 24, str(want))
		assert_true(scene.size.x <= maxf(want.x, 24.0), "never bigger than asked: %s" % want)

func test_the_base_picture_covers_the_painting_whatever_the_fit() -> void:
	var layer := CanvasLayer.new()
	add_child_autofree(layer)
	var view := BaseView.new()
	view.layer = layer
	layer.add_child(view)
	view.build()
	for screen: Vector2 in [Vector2(1080, 1920), Vector2(720, 1600), Vector2(1440, 3200), Vector2(360, 640)]:
		view.apply_fit(screen, 300.0, 200.0)
		assert_almost_eq(view.painting_size(), CampLayout.WORLD, Vector2.ONE * 0.01, str(screen))
