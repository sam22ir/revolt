class_name GroundPlan
extends RefCounted
## The per-tile ground plan, ported from apps/client/src/scene: ground-tint.ts (blended colour, land tint), ground-plan.ts
## (interior share), terrain-props.ts (propsFor), ground-decals.ts (decalsFor). Inputs are exactly what the Phaser
## GroundLayer builds: terrain indices, GEO flags (with the OASIS_FRONT bit), float32 fertility and byte cluster strength.
## Checked against golden data in test_ground_plan_fixtures.gd.

const T_PLAIN := 0
const T_HILLS := 1
const T_FOREST := 2
const T_MOUNTAIN := 3

## theme.terrain[id][0] per terrain index (plain, hills, forest, mountain).
const PALETTE: Array[int] = [0xc99c60, 0xae9448, 0x6b5e34, 0x6a5846]

## Weights of a tile and its eight neighbours: a small blur, so a terrain change fades over about two tiles.
const WEIGHTS: Array[int] = [1, 2, 1, 2, 4, 2, 1, 2, 1]
const WEIGHT_SUM := 16.0
const DRIFT_CELL := 5
const DRIFT_RANGE := 0.12
const WIDE_DRIFT_CELL := 16
const WIDE_DRIFT_RANGE := 0.08

const FERTILE := 0xa39a58
const BARE := 0xd9b77e
const DAMP := 0x8f8c4c

const OLIVE_FRAMES: Array[int] = [3, 7, 12, 15]
const ORCHARD_FRAMES: Array[int] = [3, 7, 12, 15, 1, 5, 13, 17]
const ARID := 0.38
const ROCKY := 0.6

const BASE_CHANCE := 0.16
const CLUSTER_CHANCE := 0.34
const CLUSTER_KIND := 0.2
const GREEN_GROUND := 0.55
const TRACK_SHARE := 0.12
const NO_DECAL := Geography.GEO_ROAD | Geography.GEO_OASIS | Geography.GEO_WADI

## Returns {"colours": PackedInt32Array (0xRRGGBB per tile), "props": Array of {i, kind, pick, dx, dy, scale, flip, frames}
## in tile order, "decals": Array of {x, y, frame, scale, flip, alpha}}.
## `decal_frames` maps a decal kind ("sand", "grass", "stone", "track") to its atlas frame indices.
## `props_only` skips the tile colours and the decals, which the map no longer draws (the fixtures still check them): most of the time.
static func build(seed: int, size: int, terrain: PackedInt32Array, flags: PackedByteArray, fertility: PackedFloat32Array, rocks: PackedByteArray, grove: PackedByteArray, decal_frames: Dictionary, props_only := false) -> Dictionary:
	var colours := PackedInt32Array()
	colours.resize(size * size)
	var props: Array = []
	for y in size:
		for x in size:
			var i := y * size + x
			var rock_w := float(rocks[i]) / 255.0
			var grove_w := float(grove[i]) / 255.0
			if not props_only:
				colours[i] = land_tint(blended_ground(terrain, size, x, y), terrain[i], flags[i], fertility[i])
			var depth := mountain_depth(terrain, flags, size, x, y) if terrain[i] == T_MOUNTAIN else 0
			for p: Dictionary in props_for(terrain[i], x, y, _interior(terrain, size, x, y), flags[i], fertility[i], rock_w, grove_w, depth):
				p["i"] = i
				props.append(p)
	return {"colours": colours, "props": props, "decals": [] if props_only else decals_for(seed, size, terrain, fertility, flags, rocks, grove, decal_frames)}

# ---------------------------------------------------------------- colour

static func _channel(c: int, shift: int) -> int:
	return (c >> shift) & 0xff

static func _id_at(terrain: PackedInt32Array, size: int, x: int, y: int) -> int:
	if x < 0 or y < 0 or x >= size or y >= size:
		return -1
	return terrain[y * size + x]

static func _smooth_noise(x: int, y: int, cell: int, salt: int) -> float:
	var gx := int(floor(float(x) / cell))
	var gy := int(floor(float(y) / cell))
	var fx := float(x) / cell - gx
	var fy := float(y) / cell - gy
	var top := GroundMath.hash01(gx, gy, salt) * (1.0 - fx) + GroundMath.hash01(gx + 1, gy, salt) * fx
	var bottom := GroundMath.hash01(gx, gy + 1, salt) * (1.0 - fx) + GroundMath.hash01(gx + 1, gy + 1, salt) * fx
	return top * (1.0 - fy) + bottom * fy

static func _drift_at(x: int, y: int) -> float:
	return (_smooth_noise(x, y, DRIFT_CELL, 91) - 0.5) * DRIFT_RANGE + (_smooth_noise(x, y, WIDE_DRIFT_CELL, 92) - 0.5) * WIDE_DRIFT_RANGE

static func _round(v: float) -> int:
	return int(floor(v + 0.5))

## The tile's terrain colour blended with its neighbours' and shifted by a slow brightness drift (0xRRGGBB).
## Off the map counts as the tile's own terrain.
static func blended_ground(terrain: PackedInt32Array, size: int, x: int, y: int) -> int:
	var own := _id_at(terrain, size, x, y)
	var sum_r := 0
	var sum_g := 0
	var sum_b := 0
	for dy in range(-1, 2):
		for dx in range(-1, 2):
			var id := _id_at(terrain, size, x + dx, y + dy)
			var colour := PALETTE[own if id < 0 else id]
			var w := WEIGHTS[(dy + 1) * 3 + (dx + 1)]
			sum_r += w * _channel(colour, 16)
			sum_g += w * _channel(colour, 8)
			sum_b += w * _channel(colour, 0)
	var k := 1.0 + _drift_at(x, y)
	var r := maxi(0, mini(255, _round(float(sum_r) / WEIGHT_SUM * k)))
	var g := maxi(0, mini(255, _round(float(sum_g) / WEIGHT_SUM * k)))
	var b := maxi(0, mini(255, _round(float(sum_b) / WEIGHT_SUM * k)))
	return (r << 16) | (g << 8) | b

static func _mix(a: int, b: int, t: float) -> int:
	var k := clampf(t, 0.0, 1.0)
	var r := _round(_channel(a, 16) * (1.0 - k) + _channel(b, 16) * k)
	var g := _round(_channel(a, 8) * (1.0 - k) + _channel(b, 8) * k)
	var bl := _round(_channel(a, 0) * (1.0 - k) + _channel(b, 0) * k)
	return (r << 16) | (g << 8) | bl

## Shifts an open-ground colour by how green the land is. Forests and mountains keep their colour.
static func land_tint(colour: int, terrain_index: int, flags: int, fertility: float) -> int:
	if terrain_index == T_FOREST or terrain_index == T_MOUNTAIN:
		return colour
	if (flags & Geography.GEO_OASIS_RING) != 0:
		return _mix(colour, DAMP, 0.45)
	if fertility > 0.5:
		return _mix(colour, FERTILE, (fertility - 0.5) * 0.9)
	return _mix(colour, BARE, (0.5 - fertility) * 0.8)

## The props of tiles x0..x1-1, y0..y1-1 (a chunk), as `build` gives them for those tiles: each reads its neighbours on the whole map, so
## the chunks' props together are the whole map's.
static func chunk_props(size: int, terrain: PackedInt32Array, flags: PackedByteArray, fertility: PackedFloat32Array, rocks: PackedByteArray, grove: PackedByteArray, x0: int, y0: int, x1: int, y1: int) -> Array:
	var props: Array = []
	for y in range(maxi(y0, 0), mini(y1, size)):
		for x in range(maxi(x0, 0), mini(x1, size)):
			var i := y * size + x
			var depth := mountain_depth(terrain, flags, size, x, y) if terrain[i] == T_MOUNTAIN else 0
			for p: Dictionary in props_for(terrain[i], x, y, _interior(terrain, size, x, y), flags[i], fertility[i], float(rocks[i]) / 255.0, float(grove[i]) / 255.0, depth):
				p["i"] = i
				props.append(p)
	return props

## Share of the eight neighbours with the same terrain; off the map counts as the same.
static func _interior(terrain: PackedInt32Array, size: int, x: int, y: int) -> float:
	var id := terrain[y * size + x]
	var same := 0
	for dx in range(-1, 2):
		for dy in range(-1, 2):
			if dx == 0 and dy == 0:
				continue
			var nx := x + dx
			var ny := y + dy
			if nx < 0 or ny < 0 or nx >= size or ny >= size or terrain[ny * size + nx] == id:
				same += 1
	return float(same) / 8.0

## How deep inside its mountain a mountain tile is: 0 on its edge, 1 two tiles in, 2 deeper. Roads, riverbeds and pools
## through a mountain count as its edge; off the map counts as mountain (the frontier mirrors it).
static func mountain_depth(terrain: PackedInt32Array, flags: PackedByteArray, size: int, x: int, y: int) -> int:
	for r in [1, 2]:
		for dy in range(-r, r + 1):
			for dx in range(-r, r + 1):
				var nx := x + dx
				var ny := y + dy
				if nx < 0 or ny < 0 or nx >= size or ny >= size:
					continue
				var j := ny * size + nx
				if terrain[j] != T_MOUNTAIN or (flags[j] & NO_DECAL) != 0:
					return r - 1
	return 2

## The massif frames for a depth (tools/blender/map_pieces.py peaks): foothills, cliff blocks, summits.
static func massif_frames(depth: int) -> Array[int]:
	var out: Array[int] = []
	for j in 6:
		out.append(mini(depth, 2) * 6 + j)
	return out

# ---------------------------------------------------------------- props

static func _prop(x: int, y: int, salt: int, kind: String, scale_lo: float, scale_hi: float, spread: float = 0.3, frames: Variant = null) -> Dictionary:
	return {
		"kind": kind,
		"pick": GroundMath.hash01(x, y, salt),
		"dx": (GroundMath.hash01(x, y, salt + 1) - 0.5) * 2.0 * spread,
		"dy": (GroundMath.hash01(x, y, salt + 2) - 0.5) * 2.0 * spread,
		"scale": scale_lo + GroundMath.hash01(x, y, salt + 3) * (scale_hi - scale_lo),
		"flip": GroundMath.hash01(x, y, salt + 4) < 0.5,
		"frames": frames,
	}

## The props on a tile (terrain-props.ts propsFor). `interior` is the share of its eight neighbours with the same terrain.
static func props_for(terrain_index: int, x: int, y: int, interior: float, flags: int, fertility: float, rocks: float, grove: float, depth: int = 0) -> Array:
	var out: Array = []
	var r := GroundMath.hash01(x, y, 1)
	var not_mountain := terrain_index != T_MOUNTAIN
	# Landmarks first: roads and pools stay clear, a riverbed has only pebbles, and water greens what is around it.
	if (flags & (Geography.GEO_ROAD | Geography.GEO_OASIS)) != 0:
		return out
	if (flags & Geography.GEO_WADI) != 0:
		if r < 0.12:
			out.append(_prop(x, y, 10, "rocks", 0.5, 0.7, 0.3))
		return out
	if not_mountain and (flags & (Geography.GEO_OASIS_SHORE | Geography.OASIS_FRONT)) != 0:
		if r < 0.4:
			out.append(_prop(x, y, 10, "scrub", 0.6, 0.85, 0.3))
		return out
	if not_mountain and (flags & Geography.GEO_OASIS_RING) != 0:
		var trees := 2 if r < 0.55 else 1
		for i in trees:
			out.append(_prop(x, y, 10 + i * 7, "trees", 0.75, 1.0, 0.3, ORCHARD_FRAMES))
		return out
	if (terrain_index == T_PLAIN or terrain_index == T_HILLS) and (flags & Geography.GEO_BANK) != 0:
		if r < 0.4:
			out.append(_prop(x, y, 10, "scrub", 0.8, 1.05, 0.3))
		elif r < 0.62:
			out.append(_prop(x, y, 10, "trees", 0.7, 0.9, 0.3, OLIVE_FRAMES))
		return out
	if terrain_index == T_PLAIN or terrain_index == T_HILLS:
		if rocks > 0.0 and fertility < ROCKY:
			# Few rocks, in the rockiest ground, and big enough to stand up and throw a shadow.
			if r < 0.08 + 0.3 * rocks:
				var lo := 0.9 + 0.3 * rocks
				var hi := 1.15 + 0.35 * rocks
				out.append(_prop(x, y, 10, "rocks", lo, hi, 0.3))
				if rocks > 0.8:
					out.append(_prop(x, y, 40, "rocks", lo * 0.7, hi * 0.7, 0.35))
		elif grove > 0.0:
			var green := minf(1.0, maxf(0.0, fertility))
			var p := minf(0.85, (0.3 + 0.55 * grove) * (0.6 + 0.8 * green))
			if r < p:
				if fertility > ARID:
					out.append(_prop(x, y, 10, "trees", 0.72, 0.92, 0.28, OLIVE_FRAMES))
				else:
					out.append(_prop(x, y, 10, "scrub", 0.75, 1.0, 0.35))
			elif GroundMath.hash01(x, y, 2) < 0.15:
				out.append(_prop(x, y, 40, "scrub", 0.75, 1.0, 0.35))
		else:
			var scrub := 0.06 if terrain_index == T_HILLS else 0.02
			if r < scrub:
				out.append(_prop(x, y, 10, "scrub", 0.7, 1.0, 0.35))
			elif r < scrub + 0.006:
				out.append(_prop(x, y, 10, "rocks", 0.7, 0.95, 0.35))
		return out
	if terrain_index == T_FOREST:
		var count := 0
		if interior > 0.85:
			count = 2 if r < 0.55 else 1
		elif interior > 0.45:
			count = 1 if r < 0.6 else 0
		elif r < 0.1:
			count = 1
		for i in count:
			out.append(_prop(x, y, 10 + i * 7, "trees", 0.85, 1.1, 0.22 if i == 0 else 0.3))
		if interior > 0.45 and GroundMath.hash01(x, y, 2) < 0.22:
			out.append(_prop(x, y, 40, "scrub", 0.8, 1.1, 0.35))
	elif terrain_index == T_MOUNTAIN:
		# One piece of massif per tile, taller the deeper in; a few boulders below the foothills.
		if depth > 0 or r < 0.6:
			out.append(_prop(x, y, 10, "peaks", 0.92, 1.08, 0.12, massif_frames(depth)))
		if depth == 0 and GroundMath.hash01(x, y, 2) < 0.2:
			out.append(_prop(x, y, 40, "rocks", 0.9, 1.2, 0.45))
	return out

# ---------------------------------------------------------------- decals

static func _decal_kind(terrain_index: int, fertility: float, rock_w: float, grove_w: float, r: float) -> String:
	if rock_w > CLUSTER_KIND and rock_w >= grove_w and fertility < ROCKY:
		return "stone"
	if terrain_index == T_MOUNTAIN:
		return "stone"
	if terrain_index == T_FOREST:
		return "grass"
	if grove_w > CLUSTER_KIND or fertility > GREEN_GROUND:
		return "grass"
	return "track" if r < TRACK_SHARE else "sand"

## The painted decals of a map (ground-decals.ts decalsFor): sparse stamps placed by hash, gathered by the clusters.
static func decals_for(seed: int, size: int, terrain: PackedInt32Array, fertility: PackedFloat32Array, flags: PackedByteArray, rocks: PackedByteArray, grove: PackedByteArray, decal_frames: Dictionary) -> Array:
	var out: Array = []
	var salt := GroundMath.to_int32(seed) * 16 + 900
	for y in size:
		for x in size:
			var i := y * size + x
			if (flags[i] & NO_DECAL) != 0:
				continue
			var rock_w := float(rocks[i]) / 255.0
			var grove_w := float(grove[i]) / 255.0
			var chance := BASE_CHANCE + CLUSTER_CHANCE * maxf(rock_w, grove_w)
			if GroundMath.hash01(x, y, salt) >= chance:
				continue
			var kind := _decal_kind(terrain[i], fertility[i], rock_w, grove_w, GroundMath.hash01(x, y, salt + 1))
			var frames: Array = decal_frames[kind]
			if frames.is_empty():
				continue
			out.append({
				"x": x + 0.5 + (GroundMath.hash01(x, y, salt + 2) - 0.5) * 0.9,
				"y": y + 0.5 + (GroundMath.hash01(x, y, salt + 3) - 0.5) * 0.9,
				"frame": int(frames[int(floor(GroundMath.hash01(x, y, salt + 4) * frames.size()))]),
				"scale": 2.0 + 2.0 * GroundMath.hash01(x, y, salt + 5),
				"flip": GroundMath.hash01(x, y, salt + 6) < 0.5,
				"alpha": 0.45 + 0.35 * GroundMath.hash01(x, y, salt + 7),
			})
	return out
