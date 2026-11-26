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
	var coarse := noise_field(seed, size, 8)
	var fine := noise_field(seed + 1, size, 3)
	var terrain := PackedInt32Array()
	terrain.resize(size * size)
	var height := PackedFloat32Array()
	height.resize(size * size)
	for i in size * size:
		var h := 0.65 * coarse[i] + 0.35 * fine[i]
		height[i] = h
		if h > MOUNTAIN_FROM:
			terrain[i] = 3
		elif h > HILLS_FROM:
			terrain[i] = 1
		elif h < FOREST_UNDER:
			terrain[i] = 2
	return {"terrain": terrain, "regions": _regions(seed, size, region_cell), "height": height}

## valueNoise(noise_seed, x, y, cell) for every tile of a size x size map, row-major (index = y * size + x).
## Each lattice row is blended across x once (the `top` and `bottom` of _noise), so a tile only blends two of those rows; the float
## operations and their order are _noise's, so the values are identical.
static func noise_field(noise_seed: int, size: int, cell: int) -> PackedFloat64Array:
	var lattice := _lattice(noise_seed, size, cell)
	var stride := size / cell + 2
	var across := PackedFloat64Array()
	across.resize(stride * size)
	for g in stride:
		for x in size:
			var gx := x / cell
			var fx := (float(x) - gx * cell) / cell
			across[g * size + x] = lattice[g * stride + gx] * (1.0 - fx) + lattice[g * stride + gx + 1] * fx
	var out := PackedFloat64Array()
	out.resize(size * size)
	for y in size:
		var gy := y / cell
		var fy := (float(y) - gy * cell) / cell
		var top := gy * size
		var bottom := top + size
		var row := y * size
		for x in size:
			out[row + x] = across[top + x] * (1.0 - fy) + across[bottom + x] * fy
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

## The nearest region site to each tile (ties to the lower id), among the sites of the tile's region cell and the eight round it.
## A region is convex, so a block of tiles in one region cell whose four corner tiles share a nearest site shares it throughout: blocks
## are filled whole and split only where their corners disagree, near the borders (the same answer as testing every tile).
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
	out.fill(-1)
	for cy0 in n:
		for cx0 in n:
			# Tiles x0..x1, y0..y1 of this region cell (the last row and column of cells take what is left of the map).
			var stack: Array[Vector4i] = [Vector4i(cx0 * region_cell, cy0 * region_cell, size - 1 if cx0 == n - 1 else (cx0 + 1) * region_cell - 1, size - 1 if cy0 == n - 1 else (cy0 + 1) * region_cell - 1)]
			while not stack.is_empty():
				var b: Vector4i = stack.pop_back()
				var a := _nearest_site(out, sites_x, sites_y, n, cx0, cy0, b.x, b.y, size)
				if b.x == b.z and b.y == b.w:
					continue
				if _nearest_site(out, sites_x, sites_y, n, cx0, cy0, b.z, b.y, size) == a and _nearest_site(out, sites_x, sites_y, n, cx0, cy0, b.x, b.w, size) == a \
						and _nearest_site(out, sites_x, sites_y, n, cx0, cy0, b.z, b.w, size) == a:
					for y in range(b.y, b.w + 1):
						for x in range(b.x, b.z + 1):
							out[y * size + x] = a
					continue
				var mx := (b.x + b.z) / 2
				var my := (b.y + b.w) / 2
				stack.append(Vector4i(b.x, b.y, mx, my))
				if mx < b.z:
					stack.append(Vector4i(mx + 1, b.y, b.z, my))
				if my < b.w:
					stack.append(Vector4i(b.x, my + 1, mx, b.w))
				if mx < b.z and my < b.w:
					stack.append(Vector4i(mx + 1, my + 1, b.z, b.w))
	return out

## The nearest site to tile (x, y) of region cell (cx0, cy0), worked out once and kept in `out`.
static func _nearest_site(out: PackedInt32Array, sites_x: PackedFloat64Array, sites_y: PackedFloat64Array, n: int, cx0: int, cy0: int, x: int, y: int, size: int) -> int:
	var known := out[y * size + x]
	if known >= 0:
		return known
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
	return best_id
