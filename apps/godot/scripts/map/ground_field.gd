class_name GroundField
extends RefCounted
## The two small pictures the ground shader (shaders/map_ground.gdshader) reads the map from: the land (height, the part of it that
## rises as mountains, fertility, rocks and groves) and how far each place is from a road, a riverbed and a pool. All of it comes
## from the terrain seed; nothing here is gameplay.

## Field px per tile on the 64-tile map; bigger maps get fewer (detail), so neither picture passes MAX_SIDE px a side.
const DETAIL := 8
const MAX_SIDE := 1024
## The distances the shader's NEAR and FAR stand for, in tiles.
const NEAR := 0.8
const FAR := 2.0
## Where the land steps up (MapGrid's height): hills at T1 are a ledge, mountains rise at T2 and again at T3. The shader reads them.
const T1 := MapGrid.HILLS_FROM
const T2 := 0.735
const T3 := 0.80
## Mountain land that must stay low is held just under T2; land whose top step would reach two tiles down, just under T3.
const HELD := 0.70
const HELD_HIGH := 0.795

## The height mountains rise by, per tile. A face hangs down the screen from a mountain's edge, so a tile may only rise as far as
## the land below it allows: one step if the tiles next to it down the screen are mountain too, two if those two tiles down are
## as well. Roads, riverbeds and pools count as low land even on a mountain.
static func rising(height: PackedFloat32Array, terrain: PackedInt32Array, size: int, flags: PackedByteArray = PackedByteArray()) -> PackedFloat32Array:
	var out := height.duplicate()
	var low := func(x: int, y: int) -> bool:
		if x >= size or y >= size:
			return false
		var j := y * size + x
		return terrain[j] != GroundPlan.T_MOUNTAIN or (not flags.is_empty() and (flags[j] & GroundPlan.NO_DECAL) != 0)
	for y in size:
		for x in size:
			var i := y * size + x
			if terrain[i] != GroundPlan.T_MOUNTAIN:
				continue
			for step: Vector2i in [Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]:
				if low.call(x + step.x, y + step.y):
					out[i] = minf(out[i], HELD)
			for step: Vector2i in [Vector2i(2, 0), Vector2i(0, 2), Vector2i(2, 1), Vector2i(1, 2), Vector2i(2, 2)]:
				if low.call(x + step.x, y + step.y):
					out[i] = minf(out[i], HELD_HIGH)
	return out

## The land picture, smooth between tiles. `clear` tiles (roads, riverbeds, pools) never rise.
static func land(size: int, height: PackedFloat32Array, terrain: PackedInt32Array, fertility: PackedFloat32Array, rocks: PackedByteArray, grove: PackedByteArray, flags: PackedByteArray) -> Image:
	var up := rising(height, terrain, size, flags)
	# Full floats: Godot's cubic resize leaves half floats unchanged.
	var px := PackedFloat32Array()
	px.resize(size * size * 4)
	for i in size * size:
		var h := height[i]
		var m := up[i]
		if (flags[i] & GroundPlan.NO_DECAL) != 0:
			m = minf(m, HELD)
			h = minf(h, MapGrid.HILLS_FROM - 0.03)
		px[i * 4] = h
		px[i * 4 + 1] = m
		px[i * 4 + 2] = fertility[i]
		px[i * 4 + 3] = 0.5 + (float(rocks[i]) - float(grove[i])) / 510.0
	var image := Image.create_from_data(size, size, false, Image.FORMAT_RGBAF, px.to_byte_array())
	image.resize(size * detail(size), size * detail(size), Image.INTERPOLATE_CUBIC)
	image.convert(Image.FORMAT_RGBAH)
	return image

## Field px per tile for a map `size` tiles wide.
static func detail(size: int) -> int:
	return clampi(MAX_SIDE / maxi(size, 1), 2, DETAIL)

## The distance picture drawn a part at a time, nearest a focus first (FeatureFill), for a map too big to draw at once.
class FeatureFill extends RefCounted:
	var size := 0
	var _k := 0
	var _n := 0
	var _bytes := PackedByteArray()
	## Stamps to do, nearest the focus first: `_order` holds each job's index under its rounded squared distance (a packed sort, no
	## script callback); a job is its point, width, channel and reach. Stamps take the nearest distance, so their order only decides
	## what is drawn first.
	var _order := PackedInt64Array()
	var _at := PackedVector2Array()
	var _job := PackedFloat32Array()
	var _done := 0
	var _focus := Vector2()

	func _init(map_size: int, wadis: Array, roads: Array, oases: Array, focus: Vector2) -> void:
		size = map_size
		_k = GroundField.detail(size)
		_n = size * _k
		_bytes.resize(_n * _n * 4)
		_bytes.fill(255)
		_focus = focus
		for pair: Array in [[roads, 0], [wadis, 1]]:
			for path: Array in pair[0]:
				for j in range(0, path.size(), 2):
					var p: Array = path[j]
					_at.append(Vector2(float(p[0]), float(p[1])))
					_job.append_array([float(p[2]), pair[1], NEAR])
		for o: Vector2i in oases:
			_at.append(Vector2(o.x + 0.5, o.y + 0.5))
			_job.append_array([1.0, 2, FAR])
		_order.resize(_at.size())
		for j in _at.size():
			_order[j] = (int(_at[j].distance_squared_to(focus) * 64.0) << 24) | j
		_order.sort()

	func _stamp_next() -> void:
		var j := _order[_done] & 0xFFFFFF
		GroundField._stamp(_bytes, _n, _k, _at[j], _job[j * 3], int(_job[j * 3 + 1]), _job[j * 3 + 2])
		_done += 1

	## Stamps until `budget_ms` has passed (or everything is done); true when done.
	func step(budget_ms: float) -> bool:
		var until := Time.get_ticks_usec() + int(budget_ms * 1000.0)
		while _done < _order.size():
			_stamp_next()
			if _done % 4 == 0 and Time.get_ticks_usec() >= until:
				break
		return done()

	## Stamps everything within `radius` tiles of the focus given at the start (the jobs are in that order).
	func stamp_near(radius: float) -> void:
		while _done < _order.size() and _at[_order[_done] & 0xFFFFFF].distance_squared_to(_focus) <= radius * radius:
			_stamp_next()

	func done() -> bool:
		return _done >= _order.size()

	func image() -> Image:
		return Image.create_from_data(_n, _n, false, Image.FORMAT_RGBA8, _bytes)

## The distance picture.
static func features(size: int, wadis: Array, roads: Array, oases: Array) -> Image:
	var k := detail(size)
	var n := size * k
	var bytes := PackedByteArray()
	bytes.resize(n * n * 4)
	bytes.fill(255)
	for path: Array in roads:
		_stamp_path(bytes, n, k, path, 0)
	for path: Array in wadis:
		_stamp_path(bytes, n, k, path, 1)
	for o: Vector2i in oases:
		_stamp(bytes, n, k, Vector2(o.x + 0.5, o.y + 0.5), 1.0, 2, FAR)
	return Image.create_from_data(n, n, false, Image.FORMAT_RGBA8, bytes)

## A path's points ([x, y, width factor]); a point's distance is divided by its width, so wide stretches are wide.
static func _stamp_path(bytes: PackedByteArray, n: int, k: int, path: Array, channel: int) -> void:
	for j in range(0, path.size(), 2):
		var p: Array = path[j]
		_stamp(bytes, n, k, Vector2(p[0], p[1]), float(p[2]), channel, NEAR)

## `k` is field px per tile.
static func _stamp(bytes: PackedByteArray, n: int, k: int, at: Vector2, width: float, channel: int, reach: float) -> void:
	var r := ceili(reach * width * k) + 1
	var cx := at.x * k - 0.5
	var cy := at.y * k - 0.5
	var scale := 255.0 / (reach * width * k)
	var x0 := maxi(0, floori(cx) - r)
	var x1 := mini(n, ceili(cx) + r + 1)
	for y in range(maxi(0, floori(cy) - r), mini(n, ceili(cy) + r + 1)):
		var dy2 := (y - cy) * (y - cy)
		var i := (y * n + x0) * 4 + channel
		for x in range(x0, x1):
			var d := int(sqrt((x - cx) * (x - cx) + dy2) * scale)
			if d < bytes[i]:
				bytes[i] = d
			i += 4
