class_name GroundField
extends RefCounted
## The two small pictures the ground shader (shaders/map_ground.gdshader) reads the map from: the land (height, the part of it that
## rises as mountains, fertility, rocks and groves) and how far each place is from a road, a riverbed and a pool. All of it comes
## from the terrain seed; nothing here is gameplay.

## Field px per tile.
const DETAIL := 8
## The distances the shader's NEAR and FAR stand for, in tiles.
const NEAR := 0.8
const FAR := 2.0
## Mountain land that must stay low is held just under the first mountain step.
const HELD := 0.70

## Height (the noise behind MapGrid's terrain) per tile, kept low where a mountain's face would hang over land that is not one: only
## a mountain tile whose neighbours down the screen are mountains too may rise.
static func rising(height: PackedFloat32Array, terrain: PackedInt32Array, size: int) -> PackedFloat32Array:
	var out := height.duplicate()
	for y in size:
		for x in size:
			var i := y * size + x
			if terrain[i] != GroundPlan.T_MOUNTAIN:
				continue
			for step: Vector2i in [Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]:
				var n := Vector2i(x, y) + step
				if n.x < size and n.y < size and terrain[n.y * size + n.x] != GroundPlan.T_MOUNTAIN:
					out[i] = minf(out[i], HELD)
					break
	return out

## The land picture, smooth between tiles. `clear` tiles (roads, riverbeds, pools) never rise.
static func land(size: int, height: PackedFloat32Array, terrain: PackedInt32Array, fertility: PackedFloat32Array, rocks: PackedByteArray, grove: PackedByteArray, flags: PackedByteArray) -> Image:
	var up := rising(height, terrain, size)
	# Full floats: Godot's cubic resize leaves half floats unchanged.
	var image := Image.create_empty(size, size, false, Image.FORMAT_RGBAF)
	for y in size:
		for x in size:
			var i := y * size + x
			var h := height[i]
			var m := up[i]
			if (flags[i] & GroundPlan.NO_DECAL) != 0:
				m = minf(m, HELD)
				h = minf(h, MapGrid.HILLS_FROM - 0.03)
			image.set_pixel(x, y, Color(h, m, fertility[i], 0.5 + (float(rocks[i]) - float(grove[i])) / 510.0))
	image.resize(size * DETAIL, size * DETAIL, Image.INTERPOLATE_CUBIC)
	image.convert(Image.FORMAT_RGBAH)
	return image

## The distance picture.
static func features(size: int, wadis: Array, roads: Array, oases: Array) -> Image:
	var n := size * DETAIL
	var bytes := PackedByteArray()
	bytes.resize(n * n * 4)
	bytes.fill(255)
	for path: Array in roads:
		_stamp_path(bytes, n, path, 0)
	for path: Array in wadis:
		_stamp_path(bytes, n, path, 1)
	for o: Vector2i in oases:
		_stamp(bytes, n, Vector2(o.x + 0.5, o.y + 0.5), 1.0, 2, FAR)
	return Image.create_from_data(n, n, false, Image.FORMAT_RGBA8, bytes)

## A path's points ([x, y, width factor]); a point's distance is divided by its width, so wide stretches are wide.
static func _stamp_path(bytes: PackedByteArray, n: int, path: Array, channel: int) -> void:
	for k in range(0, path.size(), 2):
		var p: Array = path[k]
		_stamp(bytes, n, Vector2(p[0], p[1]), float(p[2]), channel, NEAR)

static func _stamp(bytes: PackedByteArray, n: int, at: Vector2, width: float, channel: int, reach: float) -> void:
	var r := ceili(reach * width * DETAIL) + 1
	var cx := at.x * DETAIL - 0.5
	var cy := at.y * DETAIL - 0.5
	var scale := 255.0 / (reach * width * DETAIL)
	for y in range(maxi(0, floori(cy) - r), mini(n, ceili(cy) + r + 1)):
		for x in range(maxi(0, floori(cx) - r), mini(n, ceili(cx) + r + 1)):
			var d := int(sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) * scale)
			var i := (y * n + x) * 4 + channel
			if d < bytes[i]:
				bytes[i] = d
