class_name MapMath
extends RefCounted
## Seed-derived map math, ported line by line from packages/rules (rng.ts hash32, terrain.ts, regions.ts).
## The server never sends terrain or regions: the client computes them from `terrainSeed` and `size`.
## test/unit/test_map_fixtures.gd checks every function against grids produced by the real rules.
##
## GDScript ints are 64-bit and `/` on two ints is integer division, so: mask to 32 bits where the TypeScript
## uses Math.imul / >>> 0, and use floats explicitly for every division. The two multiplications in hash32 stay
## below 2^63 for 32-bit inputs; do not reuse this hash with wider constants.
## Sites are returned as [x, y] arrays of 64-bit floats, never Vector2 (32-bit floats), so region borders
## decide exactly as they do in the rules.

const MASK := 0xFFFFFFFF
const SITE_SALT := 7919
const TERRAIN_BY_LETTER := {"p": "plain", "h": "hills", "f": "forest", "m": "mountain"}

static func hash32(values: Array) -> int:
	var h := 0x811c9dc5
	for v: int in values:
		h = ((h ^ (v & MASK)) * 0x01000193) & MASK
		h = ((h ^ (h >> 13)) * 0x5bd1e995) & MASK
	return (h ^ (h >> 15)) & MASK

static func value_noise(seed: int, x: int, y: int, cell: int) -> float:
	var gx := int(floorf(float(x) / cell))
	var gy := int(floorf(float(y) / cell))
	var fx := (float(x) - gx * cell) / cell
	var fy := (float(y) - gy * cell) / cell
	var v00 := float(hash32([seed, gx, gy])) / 4294967295.0
	var v10 := float(hash32([seed, gx + 1, gy])) / 4294967295.0
	var v01 := float(hash32([seed, gx, gy + 1])) / 4294967295.0
	var v11 := float(hash32([seed, gx + 1, gy + 1])) / 4294967295.0
	var top := v00 * (1.0 - fx) + v10 * fx
	var bottom := v01 * (1.0 - fx) + v11 * fx
	return top * (1.0 - fy) + bottom * fy

## "plain", "hills", "forest" or "mountain".
static func terrain_at(seed: int, x: int, y: int) -> String:
	var h := 0.65 * value_noise(seed, x, y, 8) + 0.35 * value_noise(seed + 1, x, y, 3)
	if h > 0.72:
		return "mountain"
	if h > 0.58:
		return "hills"
	if h < 0.3:
		return "forest"
	return "plain"

## Whether a base or alliance HQ may stand on (x, y) (rules base-site.ts baseSiteOk): on the map, off its edges and clear of mountains.
static func base_site_ok(seed: int, size: int, x: int, y: int) -> bool:
	var m: Dictionary = Balance.data()["map"]
	var margin := int(m["baseEdgeMargin"])
	var clear := int(m["baseMountainClearance"])
	if x < 0 or y < 0 or x >= size or y >= size or mini(mini(x, y), mini(size - 1 - x, size - 1 - y)) < margin:
		return false
	for dy in range(-clear, clear + 1):
		for dx in range(-clear, clear + 1):
			if terrain_at(seed, x + dx, y + dy) == "mountain":
				return false
	return true

static func _cells_per_side(size: int, region_cell: int) -> int:
	return int(ceil(float(size) / region_cell))

static func _cell_site(seed: int, cx: int, cy: int, region_cell: int) -> Array[float]:
	var h1 := float(hash32([seed + SITE_SALT, cx, cy, 1])) / 4294967295.0
	var h2 := float(hash32([seed + SITE_SALT, cx, cy, 2])) / 4294967295.0
	return [(cx + 0.2 + 0.6 * h1) * region_cell, (cy + 0.2 + 0.6 * h2) * region_cell]

static func _clamp_cell(tile: int, n: int, region_cell: int) -> int:
	return mini(n - 1, maxi(0, int(floorf(float(tile) / region_cell))))

## Region id of a tile: the nearest region site among the 3x3 cells around it; ties go to the lower id.
static func region_at(seed: int, x: int, y: int, size: int, region_cell: int) -> int:
	var n := _cells_per_side(size, region_cell)
	var cx0 := _clamp_cell(x, n, region_cell)
	var cy0 := _clamp_cell(y, n, region_cell)
	var px := x + 0.5
	var py := y + 0.5
	var best_id := cy0 * n + cx0
	var best_d := INF
	for cy in range(maxi(0, cy0 - 1), mini(n - 1, cy0 + 1) + 1):
		for cx in range(maxi(0, cx0 - 1), mini(n - 1, cx0 + 1) + 1):
			var site := _cell_site(seed, cx, cy, region_cell)
			var dx := site[0] - px
			var dy := site[1] - py
			var d := dx * dx + dy * dy
			var id := cy * n + cx
			if d < best_d or (d == best_d and id < best_id):
				best_d = d
				best_id = id
	return best_id

## Site (centre point in tile coordinates) of a region id.
static func region_site(seed: int, id: int, size: int, region_cell: int) -> Array[float]:
	var n := _cells_per_side(size, region_cell)
	return _cell_site(seed, id % n, id / n, region_cell)
