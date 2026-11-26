class_name RoutePath
extends RefCounted
## The way a column walks between two tiles, for the picture only (the server times the march by the straight distance): along
## roads where one goes the same way, never over a mountain and wide of its foot, smoothed so it never zig-zags. A route much longer than the straight line
## would make the column race, so it falls back to the straight line.

## Cost of a step per kind of tile: roads cheap, the foot of a mountain dear (its rock stands over the tiles round it); mountains are
## never crossed.
const ROAD := 0.6
const NEAR_MOUNTAIN := 3.0
## A route at most this much longer than the straight line is kept.
const LONGEST := 1.3
const SMOOTHING := 2

## The search grid for a map: one cell per tile, weighted by what the tile is. Built once per map.
static func grid_for(size: int, terrain: PackedInt32Array, flags: PackedByteArray) -> AStarGrid2D:
	var g := AStarGrid2D.new()
	g.region = Rect2i(0, 0, size, size)
	g.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	g.update()
	for y in size:
		for x in size:
			var i := y * size + x
			if terrain[i] == GroundPlan.T_MOUNTAIN:
				g.set_point_solid(Vector2i(x, y))
				continue
			var w := ROAD if (flags[i] & Geography.GEO_ROAD) != 0 else 1.0
			if w > ROAD and _by_mountain(terrain, size, x, y):
				w = NEAR_MOUNTAIN
			g.set_point_weight_scale(Vector2i(x, y), w)
	return g

static func _by_mountain(terrain: PackedInt32Array, size: int, x: int, y: int) -> bool:
	for dy in range(-1, 2):
		for dx in range(-1, 2):
			var nx := x + dx
			var ny := y + dy
			if nx >= 0 and ny >= 0 and nx < size and ny < size and terrain[ny * size + nx] == GroundPlan.T_MOUNTAIN:
				return true
	return false

## Points in tile coordinates (tile middles at +0.5) from `from` to `to`.
static func route(grid: AStarGrid2D, from: Vector2i, to: Vector2i) -> PackedVector2Array:
	var straight := PackedVector2Array([Vector2(from) + Vector2(0.5, 0.5), Vector2(to) + Vector2(0.5, 0.5)])
	if grid == null or not grid.region.has_point(from) or not grid.region.has_point(to) or from == to or grid.is_point_solid(from) or grid.is_point_solid(to):
		return straight
	var cells := grid.get_id_path(from, to)
	if cells.size() < 2:
		return straight
	var pts := PackedVector2Array()
	for c: Vector2i in cells:
		pts.append(Vector2(c) + Vector2(0.5, 0.5))
	pts = chaikin(pts, SMOOTHING)
	if length(pts) > length(straight) * LONGEST:
		return straight
	return pts

## Corner cutting, keeping both ends where they are.
static func chaikin(pts: PackedVector2Array, passes: int) -> PackedVector2Array:
	var out := pts
	for _p in passes:
		if out.size() < 3:
			return out
		var next := PackedVector2Array([out[0]])
		for i in out.size() - 1:
			next.append(out[i].lerp(out[i + 1], 0.25))
			next.append(out[i].lerp(out[i + 1], 0.75))
		next.append(out[out.size() - 1])
		out = next
	return out

static func length(pts: PackedVector2Array) -> float:
	var total := 0.0
	for i in pts.size() - 1:
		total += pts[i].distance_to(pts[i + 1])
	return total

## The point `f` (0..1) of the way along.
static func point_at(pts: PackedVector2Array, f: float) -> Vector2:
	if pts.is_empty():
		return Vector2.ZERO
	var want := clampf(f, 0.0, 1.0) * length(pts)
	for i in pts.size() - 1:
		var d := pts[i].distance_to(pts[i + 1])
		if want <= d or i == pts.size() - 2:
			return pts[i].lerp(pts[i + 1], 0.0 if d <= 0.0 else clampf(want / d, 0.0, 1.0))
		want -= d
	return pts[pts.size() - 1]

## The direction of travel at `f`.
static func heading_at(pts: PackedVector2Array, f: float) -> Vector2:
	var a := point_at(pts, maxf(0.0, f - 0.02))
	var b := point_at(pts, minf(1.0, f + 0.02))
	return (b - a).normalized() if a.distance_to(b) > 0.0001 else (pts[pts.size() - 1] - pts[0]).normalized()
