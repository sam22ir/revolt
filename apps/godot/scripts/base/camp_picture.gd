class_name CampPicture
extends Node2D
## The camp, drawn back to front: the ground tiles, the shade the buildings throw, whoever is behind a building, the buildings
## (with scaffolding on the one being upgraded), then everyone else. The ground draws once; the rest redraws when told the time.

var draw_count := 0

var _ground := Node2D.new()
var _levels: Dictionary = {}
var _upgrading := ""
var _now_ms := 0
var _tiles: Array[Texture2D] = []
var _bodies := {}
var _scaffold: Texture2D
var _scaffold_of := ""
var _puff: GradientTexture2D

## Loads the ground and the figures. Called once.
func build() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	for row in CampArt.ROWS:
		for col in CampArt.COLS:
			_tiles.append(CampArt.ground_tile(col, row))
	_puff = CampLife.puff_texture()
	_ground.show_behind_parent = true
	_ground.draw.connect(_draw_ground)
	add_child(_ground)

## What to draw: building levels, the building being upgraded ("" for none) and the time.
func set_state(levels: Dictionary, upgrading: String, now_ms: int) -> void:
	_levels = levels
	_upgrading = upgrading
	_now_ms = now_ms
	queue_redraw()

func look(id: String) -> int:
	return CampArt.look_for(int(_levels.get(id, 1)))

## Everyone at the time set, as [those behind a building, those in front of all].
func sorted_figures() -> Array:
	var behind := []
	var front := []
	for f: Dictionary in CampLife.figures(_now_ms):
		var hidden := false
		for id: String in CampLayout.BUILDINGS:
			hidden = hidden or CampArt.is_behind(id, look(id), f["at"])
		(behind if hidden else front).append(f)
	return [behind, front]

func _draw_ground() -> void:
	var size := CampLayout.WORLD / Vector2(CampArt.COLS, CampArt.ROWS)
	for i in _tiles.size():
		_ground.draw_texture_rect(_tiles[i], Rect2(Vector2(i % CampArt.COLS, i / CampArt.COLS) * size, size), false)

## The pictures of the look a building shows now; another look's are let go.
func _pictures(id: String) -> Dictionary:
	var n := look(id)
	if not _bodies.has(id) or _bodies[id]["look"] != n:
		_bodies[id] = {
			"look": n,
			"body": CampArt.body(id, n),
			"body_rect": CampArt.body_rect(id, n),
			"shade": CampArt.shade(id, n),
			"shade_rect": CampArt.shade_rect(id, n),
		}
	return _bodies[id]

func _draw() -> void:
	draw_count += 1
	for id: String in CampLayout.BUILDINGS:
		var p := _pictures(id)
		draw_texture_rect(p["shade"], p["shade_rect"], false)
	var figures := sorted_figures()
	_draw_figures(figures[0])
	for id: String in CampLayout.BUILDINGS:
		var p := _pictures(id)
		draw_texture_rect(p["body"], p["body_rect"], false)
		if id == _upgrading:
			if _scaffold_of != id:
				_scaffold_of = id
				_scaffold = CampArt.scaffold(id)
			draw_texture_rect(_scaffold, CampArt.scaffold_rect(id), false)
	_draw_figures(figures[1])

func _draw_figures(list: Array) -> void:
	for f: Dictionary in list:
		var width := CampLife.width_of(f["kind"])
		draw_texture_rect(_puff, Rect2(f["at"] - Vector2(width, width * 0.5) * 0.5, Vector2(width, width * 0.5)), false, CampLife.GROUND_SHADOW)
		var cell := CampLife.cell(f["kind"], f["dir"], f["frame"])
		draw_texture_rect_region(CampLife.sheet(f["kind"]), Rect2(f["at"] - CampLife.FOOT * CampLife.FIGURE_SCALE, CampLife.CELL * CampLife.FIGURE_SCALE), cell)
