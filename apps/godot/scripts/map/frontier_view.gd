class_name FrontierView
extends Node2D
## One half of the frontier's standing things (Frontier): BEHIND the map's upper edges or in FRONT of its lower ones. Its fences and
## towers, and the mirrored trees and rocks outside them, in painter's order.

enum Side { BEHIND, FRONT }

const FENCE: Texture2D = preload("res://art/frontier/fence.svg")
const TOWER: Texture2D = preload("res://art/frontier/tower.svg")
## World px: the fence's height, and how many tiles one repeat of its art covers.
const FENCE_HEIGHT := 60.0
const FENCE_TILES := 2.0
const TOWER_HEIGHT := 128.0
## A tower every so many tiles along an edge, and at the corners.
const TOWER_EVERY := 16
## The land outside is duller than the map.
const OUTSIDE_TINT := Color(0.78, 0.74, 0.7)
const FAR_FENCE_TINT := Color(0.72, 0.7, 0.68)

var side := Side.BEHIND
var _size := 0
var _props := PropLayer.new()
var _built := Node2D.new()

func _init(which := Side.BEHIND) -> void:
	side = which
	texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_built.texture_repeat = TEXTURE_REPEAT_ENABLED
	_built.texture_filter = TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_built.draw.connect(_draw_built)
	_props.modulate = OUTSIDE_TINT
	# Farther things first: behind the map the trees are past the fence, in front of it they stand before it.
	if side == Side.BEHIND:
		add_child(_props)
		add_child(_built)
	else:
		add_child(_built)
		add_child(_props)

func setup(size: int, props: Array, art: GroundArt) -> void:
	_size = size
	_props.build(size, Frontier.mirrored_props(props, size, side == Side.BEHIND), art, {})
	_built.queue_redraw()

func prop_layer() -> PropLayer:
	return _props

func set_props_visible(shown: bool) -> void:
	_props.visible = shown

## The edges of this half, as pairs of outline corners (0 top, 1 right, 2 bottom, 3 left).
func edges() -> Array:
	return [[3, 0], [0, 1]] if side == Side.BEHIND else [[3, 2], [2, 1]]

func _draw_built() -> void:
	if _size == 0:
		return
	# The farther fence first: behind the map that is the outer one.
	var rows: Array = [Frontier.OUTER, Frontier.INNER] if side == Side.BEHIND else [Frontier.INNER, Frontier.OUTER]
	for out: float in rows:
		_draw_fence(out)
		if out == Frontier.OUTER:
			_draw_towers(out)

func _draw_fence(out: float) -> void:
	var corners := Frontier.outline(_size, out)
	var repeats := roundf((_size + out * 2.0) / FENCE_TILES)
	var up := Vector2(0.0, -FENCE_HEIGHT)
	var tint := FAR_FENCE_TINT if out == Frontier.OUTER else Color.WHITE
	for edge: Array in edges():
		var a := corners[edge[0]]
		var b := corners[edge[1]]
		_built.draw_colored_polygon(PackedVector2Array([a, b, b + up, a + up]), tint,
			PackedVector2Array([Vector2(0, 1), Vector2(repeats, 1), Vector2(repeats, 0), Vector2(0, 0)]), FENCE)

## Where the towers of this half stand, in drawing order (the farthest first).
func tower_spots() -> PackedVector2Array:
	var corners := Frontier.outline(_size, Frontier.OUTER)
	var spots: Array[Vector2] = []
	for edge: Array in edges():
		var a := corners[edge[0]]
		var b := corners[edge[1]]
		var n := int(_size / TOWER_EVERY)
		for i in range(n + 1):
			var p := a.lerp(b, float(i) / n)
			# The left and right corners belong to the front half, the top to the back.
			var at_side_corner := is_equal_approx(p.y, corners[1].y)
			if at_side_corner and side == Side.BEHIND:
				continue
			# Two edges meet at a corner.
			if not spots.any(func(q: Vector2) -> bool: return q.distance_to(p) < 1.0):
				spots.append(p)
	spots.sort_custom(func(p: Vector2, q: Vector2) -> bool: return p.y < q.y)
	return PackedVector2Array(spots)

func _draw_towers(_out: float) -> void:
	var size_px := Vector2(TOWER_HEIGHT * TOWER.get_width() / TOWER.get_height(), TOWER_HEIGHT)
	for p in tower_spots():
		_built.draw_set_transform(p, 0.0, Vector2(1.0, 0.5))
		_built.draw_circle(Vector2(8, 0), size_px.x * 0.55, Color(0, 0, 0, 0.28))
		_built.draw_set_transform(Vector2.ZERO)
		_built.draw_texture_rect(TOWER, Rect2(p - Vector2(size_px.x * 0.5, size_px.y - 5.0), size_px), false)
