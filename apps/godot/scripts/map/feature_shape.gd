class_name FeatureShape
extends RefCounted
## Shapes the tile paths of wadis and roads into smooth polylines, ported from apps/client/src/scene/world/feature-layer.ts
## (centres, Chaikin smoothing, end trimming). A point is [x, y, w]: tile coordinates (x + 0.5 is the middle of a tile)
## and the local width factor of the band. Checked against golden data in test_feature_shape_fixtures.gd.

## Chaikin passes that round a path's tile-by-tile steps into a curve.
const SMOOTH := 4
## Tiles cut from each end of a road, so it stops at the stronghold's plate instead of running under the sprite.
const ROAD_TRIM := 0.55

## Wadi polylines for `wadis` (Array of Array[Vector2i], see Geography.build).
static func wadi_paths(wadis: Array) -> Array:
	var out: Array = []
	for w in wadis:
		out.append(smooth(centres(w, 70, 0.35, 0.65, 1.35), SMOOTH))
	return out

## Road polylines for `roads`.
static func road_paths(roads: Array) -> Array:
	var out: Array = []
	for r in roads:
		out.append(trim_ends(smooth(centres(r, 80, 0.2, 0.9, 1.1), SMOOTH), ROAD_TRIM))
	return out

## A path's tile centres, each nudged by up to `jitter` tiles so the curve does not follow the grid, with a width factor
## between `w_lo` and `w_hi`. The ends stay put so paths still meet.
static func centres(path: Array, salt: int, jitter: float, w_lo: float, w_hi: float) -> Array:
	var out: Array = []
	for i in path.size():
		var t: Vector2i = path[i]
		var is_end := i == 0 or i == path.size() - 1
		var j := 0.0 if is_end else jitter
		out.append([
			t.x + 0.5 + (GroundMath.hash01(t.x, t.y, salt) - 0.5) * 2.0 * j,
			t.y + 0.5 + (GroundMath.hash01(t.x, t.y, salt + 1) - 0.5) * 2.0 * j,
			w_lo + GroundMath.hash01(t.x, t.y, salt + 2) * (w_hi - w_lo),
		])
	return out

static func _lerp_point(a: Array, b: Array, k: float) -> Array:
	return [a[0] * (1.0 - k) + b[0] * k, a[1] * (1.0 - k) + b[1] * k, a[2] * (1.0 - k) + b[2] * k]

## Chaikin corner cutting; keeps both end points.
static func smooth(pts: Array, passes: int) -> Array:
	var cur := pts.duplicate()
	var k := 0
	while k < passes and cur.size() > 2:
		var next: Array = [cur[0]]
		for i in cur.size() - 1:
			next.append(_lerp_point(cur[i], cur[i + 1], 0.25))
			next.append(_lerp_point(cur[i], cur[i + 1], 0.75))
		next.append(cur[cur.size() - 1])
		cur = next
		k += 1
	return cur

static func _cut(line: Array, trim: float) -> Array:
	var left := trim
	while line.size() > 2:
		var a: Array = line[0]
		var b: Array = line[1]
		var dx: float = b[0] - a[0]
		var dy: float = b[1] - a[1]
		var d := sqrt(dx * dx + dy * dy)
		if d > left:
			line[0] = [a[0] + dx * left / d, a[1] + dy * left / d, a[2]]
			return line
		left -= d
		line.pop_front()
	return line

## Removes `trim` tiles of length from each end of a polyline.
static func trim_ends(pts: Array, trim: float) -> Array:
	var first := _cut(pts.duplicate(), trim)
	first.reverse()
	var second := _cut(first, trim)
	second.reverse()
	return second
