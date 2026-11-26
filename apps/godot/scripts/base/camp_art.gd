class_name CampArt
extends RefCounted
## The camp's pictures, rendered from the Blender models (docs/camp-3d-plan.md): the ground in tiles, and for each building four
## looks, each a body, the shade it adds to the ground, its tap outline and its base line. Places come from data/camp-art.json in
## painting px; everything here is given in world units (half that). Which look a level shows is art, not a rule.

const DIR := "res://art/camp/"
const DATA_PATH := "res://data/camp-art.json"
## The first level each look shows at.
const LOOK_FROM: Array[int] = [1, 3, 6, 9]
## The ground's tiles.
const COLS := 3
const ROWS := 4
## World units per painting px.
const WORLD_PER_PX := 0.5

static var _data: Dictionary = {}

## The look (1 to 4) a building has at `level`.
static func look_for(level: int) -> int:
	var look := 1
	for i in LOOK_FROM.size():
		if level >= LOOK_FROM[i]:
			look = i + 1
	return look

static func _entry(key: String) -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	return _data[key]

static func _look(id: String, look: int) -> Dictionary:
	return _entry("%s_%d" % [id, look])

static func _rect(values: Array) -> Rect2:
	return Rect2(Vector2(values[0], values[1]) * WORLD_PER_PX, Vector2(values[2], values[3]) * WORLD_PER_PX)

static func _points(values: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p: Array in values:
		out.append(Vector2(p[0], p[1]) * WORLD_PER_PX)
	return out

static func ground_tile(col: int, row: int) -> Texture2D:
	return load(DIR + "ground/%d_%d.webp" % [col, row])

static func body(id: String, look: int) -> Texture2D:
	return load(DIR + "buildings/%s_%d.webp" % [id, look])

static func body_rect(id: String, look: int) -> Rect2:
	return _rect(_look(id, look)["body"])

static func shade(id: String, look: int) -> Texture2D:
	return load(DIR + "buildings/%s_%d_shade.webp" % [id, look])

static func shade_rect(id: String, look: int) -> Rect2:
	return _rect(_look(id, look)["shade"])

static func scaffold(id: String) -> Texture2D:
	return load(DIR + "buildings/%s_scaffold.webp" % id)

static func scaffold_rect(id: String) -> Rect2:
	return _rect(_entry(id + "_scaffold")["body"])

## A square picture of the building on its ground, for the cards.
static func card(id: String, look: int) -> Texture2D:
	return load(DIR + "cards/%s_%d.webp" % [id, look])

## The tap outline.
static func outline(id: String, look: int) -> PackedVector2Array:
	return _points(_look(id, look)["outline"])

## The left, front and right corners of the building's foot.
static func base(id: String, look: int) -> PackedVector2Array:
	return _points(_look(id, look)["base"])

## Whether feet at `at` are behind the building: above its base line, where its picture could cover them.
static func is_behind(id: String, look: int, at: Vector2) -> bool:
	if not body_rect(id, look).grow_side(SIDE_TOP, 60.0).has_point(at):
		return false
	var line := base(id, look)
	if at.x <= line[0].x:
		return at.y < line[0].y
	if at.x >= line[2].x:
		return at.y < line[2].y
	var a := line[0] if at.x < line[1].x else line[1]
	var b := line[1] if at.x < line[1].x else line[2]
	return at.y < lerpf(a.y, b.y, (at.x - a.x) / (b.x - a.x))

## The top of the farm's chimney.
static func chimney(look: int) -> Vector2:
	var p: Array = _look("farm", look)["chimney"]
	return Vector2(p[0], p[1]) * WORLD_PER_PX
