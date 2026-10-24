class_name Geography
extends RefCounted
## Landmarks over the terrain, ported from packages/rules/src/geography.ts: dry riverbeds (wadis), dirt roads between
## region strongholds and oases, plus per-tile GEO_* flags. A pure function of the map seed, never sent by the server.
## Same algorithms, same tie-breaks and 64-bit floats throughout (no Vector2: it is float32), so the results equal the
## rules'. Checked tile for tile against golden data in test_geography_fixtures.gd.

const GEO_WADI := 1
const GEO_ROAD := 2
const GEO_OASIS := 4
## Next to a wadi (orthogonally), not on it.
const GEO_BANK := 8
## Within two tiles of an oasis, not on it.
const GEO_OASIS_RING := 16
## One tile from an oasis (also GEO_OASIS_RING): the damp shore.
const GEO_OASIS_SHORE := 32
## Client-only bit: an oasis-ring tile in front of the pool on screen (dx + dy >= 1).
const OASIS_FRONT := 128

const T_PLAIN := 0
const T_HILLS := 1
const T_FOREST := 2
const T_MOUNTAIN := 3
const ROAD_COST: Array[float] = [1.0, 2.0, 3.0, 8.0]

## Returns {"wadis": Array of Array[Vector2i], "roads": same, "oases": Array[Vector2i], "flags": PackedByteArray}.
## `terrain` holds MapGrid terrain indices and `regions` region ids per tile (see MapGrid.compute).
static func build(seed: int, size: int, region_cell: int, terrain: PackedInt32Array, regions: PackedInt32Array) -> Dictionary:
	var flags := PackedByteArray()
	flags.resize(size * size)
	var wadis := _make_wadis(seed, size, terrain)
	for w in wadis:
		for t: Vector2i in w:
			flags[t.y * size + t.x] |= GEO_WADI

	var region_ids := _regions_of(regions)
	var sites: Array[Vector2i] = []
	for id in region_ids:
		sites.append(_site_tile(seed, id, size, region_cell))
	var roads: Array = []
	for edge: Array in _region_tree(seed, size, region_cell, regions, region_ids):
		# Existing road is cheap, so later roads join earlier ones instead of running beside them.
		var costs := PackedFloat64Array()
		costs.resize(size * size)
		for i in size * size:
			var f := flags[i]
			if (f & GEO_ROAD) != 0:
				costs[i] = 0.35
			else:
				costs[i] = ROAD_COST[terrain[i]] + (2.0 if (f & GEO_WADI) != 0 else 0.0)
		var road := _cheapest_path(size, _site_tile(seed, edge[0], size, region_cell), _site_tile(seed, edge[1], size, region_cell), costs, 0.35)
		for t: Vector2i in road:
			flags[t.y * size + t.x] |= GEO_ROAD
		roads.append(road)

	var oases := _pick_oases(seed, size, terrain, flags, sites)
	for o in oases:
		for dy in range(-2, 3):
			for dx in range(-2, 3):
				var x: int = o.x + dx
				var y: int = o.y + dy
				if x < 0 or y < 0 or x >= size or y >= size:
					continue
				var d := maxi(absi(dx), absi(dy))
				flags[y * size + x] |= GEO_OASIS if d == 0 else ((GEO_OASIS_RING | GEO_OASIS_SHORE) if d == 1 else GEO_OASIS_RING)
	for y in size:
		for x in size:
			var i := y * size + x
			if (flags[i] & GEO_WADI) != 0:
				continue
			for n in [Vector2i(x + 1, y), Vector2i(x - 1, y), Vector2i(x, y + 1), Vector2i(x, y - 1)]:
				if n.x >= 0 and n.y >= 0 and n.x < size and n.y < size and (flags[n.y * size + n.x] & GEO_WADI) != 0:
					flags[i] |= GEO_BANK
					break
	return {"wadis": wadis, "roads": roads, "oases": oases, "flags": flags}

## The client's OASIS_FRONT bit (GroundLayer.onSnapshot): oasis-ring tiles in front of a pool on screen keep low dressing.
static func with_oasis_front(flags: PackedByteArray, oases: Array, size: int) -> PackedByteArray:
	var out := flags.duplicate()
	for o in oases:
		for dy in range(-2, 3):
			for dx in range(-2, 3):
				var x: int = o.x + dx
				var y: int = o.y + dy
				if dx + dy < 1 or x < 0 or y < 0 or x >= size or y >= size:
					continue
				var i := y * size + x
				if (out[i] & GEO_OASIS_RING) != 0:
					out[i] |= OASIS_FRONT
	return out

static func _unit(seed: int, values: Array) -> float:
	var all := [seed]
	all.append_array(values)
	return float(MapMath.hash32(all)) / 4294967296.0

## A point on one edge of the map, kept away from the corners. side 0..3 = top, right, bottom, left.
static func _edge_point(size: int, side: int, t: float) -> Vector2i:
	var along := int(floor(size * (0.2 + 0.6 * t)))
	if side == 0:
		return Vector2i(along, 0)
	if side == 1:
		return Vector2i(size - 1, along)
	if side == 2:
		return Vector2i(along, size - 1)
	return Vector2i(0, along)

static func _make_wadis(seed: int, size: int, terrain: PackedInt32Array) -> Array:
	var count := maxi(1, size / 32)
	var wadis: Array = []
	for k in count:
		# Alternate the axis so two wadis cross each other's direction rather than running side by side.
		var side := (k + (MapMath.hash32([seed, 50]) & 1)) % 2
		var from := _edge_point(size, side, _unit(seed, [51, k]))
		var to := _edge_point(size, side + 2, _unit(seed, [52, k]))
		# The noise field is the valley floor the riverbed follows; mountains are dear so it winds around ranges.
		var noise := MapGrid.noise_field(seed + 53 + k, size, 6)
		var costs := PackedFloat64Array()
		costs.resize(size * size)
		for i in size * size:
			costs[i] = 1.0 + 6.0 * noise[i] + (6.0 if terrain[i] == T_MOUNTAIN else 0.0)
		wadis.append(_cheapest_path(size, from, to, costs, 1.0))
	return wadis

## Region ids that own at least one tile, ascending.
static func _regions_of(regions: PackedInt32Array) -> Array[int]:
	var seen := {}
	for r in regions:
		seen[r] = true
	var ids: Array[int] = []
	for r: int in seen:
		ids.append(r)
	ids.sort()
	return ids

## Region links of a minimum spanning tree over neighbouring regions, by site distance (Kruskal, ties by id).
static func _region_tree(seed: int, size: int, region_cell: int, regions: PackedInt32Array, region_ids: Array[int]) -> Array:
	var links := {}
	for y in size:
		for x in size:
			var id := regions[y * size + x]
			if x + 1 < size:
				var o := regions[y * size + x + 1]
				if o != id:
					links[Vector2i(mini(id, o), maxi(id, o))] = true
			if y + 1 < size:
				var o2 := regions[(y + 1) * size + x]
				if o2 != id:
					links[Vector2i(mini(id, o2), maxi(id, o2))] = true
	var edges: Array = []
	for link: Vector2i in links:
		var sa := MapMath.region_site(seed, link.x, size, region_cell)
		var sb := MapMath.region_site(seed, link.y, size, region_cell)
		var dx: float = sa[0] - sb[0]
		var dy: float = sa[1] - sb[1]
		edges.append([sqrt(dx * dx + dy * dy), link.x, link.y])
	edges.sort_custom(func(p: Array, q: Array) -> bool:
		if p[0] != q[0]:
			return p[0] < q[0]
		if p[1] != q[1]:
			return p[1] < q[1]
		return p[2] < q[2])
	var parent := {}
	var out: Array = []
	for e: Array in edges:
		var ra := _find(parent, e[1])
		var rb := _find(parent, e[2])
		if ra == rb:
			continue
		parent[ra] = rb
		out.append([e[1], e[2]])
	return out

static func _find(parent: Dictionary, r: int) -> int:
	var p: int = parent.get(r, r)
	while p != parent.get(p, p):
		p = parent.get(p, p)
	return p

static func _site_tile(seed: int, id: int, size: int, region_cell: int) -> Vector2i:
	var s := MapMath.region_site(seed, id, size, region_cell)
	return Vector2i(mini(size - 1, maxi(0, int(floor(s[0])))), mini(size - 1, maxi(0, int(floor(s[1])))))

## One oasis per 1500 tiles: bare plain, at least 3 tiles from any wadi, road or region site, and far from each other.
static func _pick_oases(seed: int, size: int, terrain: PackedInt32Array, flags: PackedByteArray, sites: Array[Vector2i]) -> Array[Vector2i]:
	var want := maxi(1, roundi(float(size * size) / 1500.0))
	var fertility := GroundMath.fertility_double(seed, size)
	var candidates: Array = []
	for y in range(3, size - 3):
		for x in range(3, size - 3):
			var i := y * size + x
			if terrain[i] != T_PLAIN or fertility[i] > 0.5:
				continue
			if _near(flags, size, x, y, GEO_WADI | GEO_ROAD, 3):
				continue
			var blocked := false
			for s in sites:
				if maxi(absi(s.x - x), absi(s.y - y)) < 4:
					blocked = true
					break
			if blocked:
				continue
			candidates.append([MapMath.hash32([seed, 60, x, y]), y, x])
	candidates.sort_custom(func(a: Array, b: Array) -> bool:
		if a[0] != b[0]:
			return a[0] < b[0]
		if a[1] != b[1]:
			return a[1] < b[1]
		return a[2] < b[2])
	var out: Array[Vector2i] = []
	var gap := maxi(8, size / 5)
	for c: Array in candidates:
		if out.size() >= want:
			break
		var too_close := false
		for o in out:
			if maxi(absi(o.x - c[2]), absi(o.y - c[1])) < gap:
				too_close = true
				break
		if too_close:
			continue
		out.append(Vector2i(c[2], c[1]))
	return out

static func _near(flags: PackedByteArray, size: int, x: int, y: int, mask: int, r: int) -> bool:
	for dy in range(-r, r + 1):
		for dx in range(-r, r + 1):
			var nx := x + dx
			var ny := y + dy
			if nx >= 0 and ny >= 0 and nx < size and ny < size and (flags[ny * size + nx] & mask) != 0:
				return true
	return false

## Cheapest 4-connected path from `from` to `to` (both included). `costs` is the price of stepping onto each tile,
## at least `min_cost`. A* with a binary heap ordered by (priority, tile index), so ties break deterministically.
static func _cheapest_path(size: int, from: Vector2i, to: Vector2i, costs: PackedFloat64Array, min_cost: float) -> Array[Vector2i]:
	var n := size * size
	var dist := PackedFloat64Array()
	dist.resize(n)
	dist.fill(INF)
	var prev := PackedInt32Array()
	prev.resize(n)
	prev.fill(-1)
	var done := PackedByteArray()
	done.resize(n)
	var start := from.y * size + from.x
	var goal := to.y * size + to.x
	var heap_p := PackedFloat64Array()
	var heap_i := PackedInt32Array()
	dist[start] = 0.0
	_push(heap_p, heap_i, (absi(start % size - to.x) + absi(start / size - to.y)) * min_cost, start)
	while heap_i.size() > 0:
		var i := _pop(heap_p, heap_i)
		if done[i] == 1:
			continue
		done[i] = 1
		if i == goal:
			break
		var x := i % size
		var y := i / size
		for step in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var nx: int = x + step.x
			var ny: int = y + step.y
			if nx < 0 or ny < 0 or nx >= size or ny >= size:
				continue
			var j := ny * size + nx
			var d := dist[i] + costs[j]
			if d < dist[j]:
				dist[j] = d
				prev[j] = i
				_push(heap_p, heap_i, d + (absi(j % size - to.x) + absi(j / size - to.y)) * min_cost, j)
	var path: Array[Vector2i] = []
	var i := goal
	while i != -1:
		path.append(Vector2i(i % size, i / size))
		i = prev[i]
	path.reverse()
	return path

static func _less(p: PackedFloat64Array, ix: PackedInt32Array, a: int, b: int) -> bool:
	return p[a] < p[b] or (p[a] == p[b] and ix[a] < ix[b])

static func _push(p: PackedFloat64Array, ix: PackedInt32Array, priority: float, index: int) -> void:
	p.append(priority)
	ix.append(index)
	var i := p.size() - 1
	while i > 0:
		var parent := (i - 1) >> 1
		if not _less(p, ix, i, parent):
			break
		_swap(p, ix, i, parent)
		i = parent

static func _pop(p: PackedFloat64Array, ix: PackedInt32Array) -> int:
	var top := ix[0]
	var last := p.size() - 1
	p[0] = p[last]
	ix[0] = ix[last]
	p.resize(last)
	ix.resize(last)
	var i := 0
	while true:
		var l := 2 * i + 1
		var r := l + 1
		var m := i
		if l < p.size() and _less(p, ix, l, m):
			m = l
		if r < p.size() and _less(p, ix, r, m):
			m = r
		if m == i:
			break
		_swap(p, ix, i, m)
		i = m
	return top

static func _swap(p: PackedFloat64Array, ix: PackedInt32Array, a: int, b: int) -> void:
	var tp := p[a]
	p[a] = p[b]
	p[b] = tp
	var ti := ix[a]
	ix[a] = ix[b]
	ix[b] = ti
