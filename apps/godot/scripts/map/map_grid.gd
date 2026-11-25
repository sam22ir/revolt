class_name MapGrid
extends RefCounted
## Whole-map terrain and region grids, computed fast: every lattice hash and region site is computed once instead
## of once per tile. It does exactly the same float operations in the same order as MapMath (the reference port),
## so results are identical; test_map_grid.gd checks it against the golden grids from the real rules.

## Terrain by height: hills from HILLS_FROM, mountains from MOUNTAIN_FROM, forest below FOREST_UNDER.
const HILLS_FROM := 0.58
const MOUNTAIN_FROM := 0.72
const FOREST_UNDER := 0.3

const TERRAIN_IDS: Array[String] = ["plain", "hills", "forest", "mountain"]

## {"terrain": PackedInt32Array (index into TERRAIN_IDS), "regions": PackedInt32Array, "height": PackedFloat32Array (the noise the
## terrain is cut from, for the ground picture)}, all row-major (y * size + x).
static func compute(seed: int, size: int, region_cell: int) -> Dictionary:
	var coarse := _lattice(seed, size, 8)
	var fine := _lattice(seed + 1, size, 3)
	var terrain := PackedInt32Array()
	terrain.resize(size * size)
	var height := PackedFloat32Array()
	height.resize(size * size)
	for y in size:
		for x in size:
			var h := 0.65 * _noise(coarse, x, y, 8, size) + 0.35 * _noise(fine, x, y, 3, size)
			var t := 0
			height[y * size + x] = h
			if h > MOUNTAIN_FROM:
				t = 3
			elif h > HILLS_FROM:
				t = 1
			elif h < FOREST_UNDER:
				t = 2
			terrain[y * size + x] = t
	return {"terrain": terrain, "regions": _regions(seed, size, region_cell), "height": height}

## valueNoise(noise_seed, x, y, cell) for every tile of a size x size map, row-major (index = y * size + x).
static func noise_field(noise_seed: int, size: int, cell: int) -> PackedFloat64Array:
	var lattice := _lattice(noise_seed, size, cell)
	var out := PackedFloat64Array()
	out.resize(size * size)
	for y in size:
		for x in size:
			out[y * size + x] = _noise(lattice, x, y, cell, size)
	return out

## Hashed lattice values for tiles 0..size-1: (cells + 2) points per side, indexed gy * stride + gx.
static func _lattice(noise_seed: int, size: int, cell: int) -> PackedFloat64Array:
	var stride := size / cell + 2
	var out := PackedFloat64Array()
	out.resize(stride * stride)
	for gy in stride:
		for gx in stride:
			out[gy * stride + gx] = float(MapMath.hash32([noise_seed, gx, gy])) / 4294967295.0
	return out

static func _noise(lattice: PackedFloat64Array, x: int, y: int, cell: int, size: int) -> float:
	var stride := size / cell + 2
	var gx := x / cell
	var gy := y / cell
	var fx := (float(x) - gx * cell) / cell
	var fy := (float(y) - gy * cell) / cell
	var v00 := lattice[gy * stride + gx]
	var v10 := lattice[gy * stride + gx + 1]
	var v01 := lattice[(gy + 1) * stride + gx]
	var v11 := lattice[(gy + 1) * stride + gx + 1]
	var top := v00 * (1.0 - fx) + v10 * fx
	var bottom := v01 * (1.0 - fx) + v11 * fx
	return top * (1.0 - fy) + bottom * fy

static func _regions(seed: int, size: int, region_cell: int) -> PackedInt32Array:
	var n := int(ceil(float(size) / region_cell))
	var sites_x := PackedFloat64Array()
	var sites_y := PackedFloat64Array()
	sites_x.resize(n * n)
	sites_y.resize(n * n)
	for id in n * n:
		var site := MapMath.region_site(seed, id, size, region_cell)
		sites_x[id] = site[0]
		sites_y[id] = site[1]
	var out := PackedInt32Array()
	out.resize(size * size)
	for y in size:
		var cy0 := mini(n - 1, y / region_cell)
		for x in size:
			var cx0 := mini(n - 1, x / region_cell)
			var px := x + 0.5
			var py := y + 0.5
			var best_id := cy0 * n + cx0
			var best_d := INF
			for cy in range(maxi(0, cy0 - 1), mini(n - 1, cy0 + 1) + 1):
				for cx in range(maxi(0, cx0 - 1), mini(n - 1, cx0 + 1) + 1):
					var id := cy * n + cx
					var dx := sites_x[id] - px
					var dy := sites_y[id] - py
					var d := dx * dx + dy * dy
					if d < best_d or (d == best_d and id < best_id):
						best_d = d
						best_id = id
			out[y * size + x] = best_id
	return out
