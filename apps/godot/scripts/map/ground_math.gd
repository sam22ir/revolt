class_name GroundMath
extends RefCounted
## Seed-derived ground data, ported from the client's pipeline (GroundLayer.onSnapshot): hash01 (terrain-props.ts),
## fertility (rules geography.ts) and decor clusters (decor-clusters.ts). Tested against golden data from the real code
## (test_ground_fixtures.gd). Fertility is a PackedFloat32Array and cluster strength is a byte per tile, exactly like the
## client's Float32Array / Uint8Array, because both change threshold results.

const MASK := 0xFFFFFFFF
const ROCKS_SALT := 700
const GROVE_SALT := 800
const CLUSTER_CELL := 6
const CLUSTER_THRESHOLD := 0.65

## Math.imul on unsigned 32-bit representations, without ever overflowing 64 bits (split into 16-bit halves).
static func imul32(a: int, b: int) -> int:
	var a32 := a & MASK
	var b32 := b & MASK
	var a_hi := a32 >> 16
	var a_lo := a32 & 0xFFFF
	var b_hi := b32 >> 16
	var b_lo := b32 & 0xFFFF
	return ((((a_hi * b_lo + a_lo * b_hi) & 0xFFFF) << 16) + a_lo * b_lo) & MASK

## `seed | 0` in JavaScript: the signed 32-bit value of a seed.
static func to_int32(v: int) -> int:
	return ((v & MASK) ^ 0x80000000) - 0x80000000

## A deterministic number in [0, 1) from a tile and a salt (terrain-props.ts hash01). It does not use the map seed.
static func hash01(x: int, y: int, salt: int) -> float:
	var h := imul32(x, 374761393) ^ imul32(y, 668265263) ^ imul32(salt, 2147483647)
	h = imul32(h ^ (h >> 13), 1274126177)
	h ^= h >> 16
	return float(h & MASK) / 4294967296.0

## Fertility of every tile as a 64-bit double (rules `fertilityAt`). Geography compares it as a double.
static func fertility_double(seed: int, size: int) -> PackedFloat64Array:
	var low := MapGrid.noise_field(seed + 30, size, 7)
	var fine := MapGrid.noise_field(seed + 31, size, 3)
	var out := PackedFloat64Array()
	out.resize(size * size)
	for i in size * size:
		out[i] = 0.7 * low[i] + 0.3 * fine[i]
	return out

## Fertility of every tile, 0 (bare sand) to 1 (olive country), as float32 like the client's Float32Array
## (the ground plan, tint, props and decals read it in this form).
static func fertility_grid(seed: int, size: int) -> PackedFloat32Array:
	var exact := fertility_double(seed, size)
	var out := PackedFloat32Array()
	out.resize(size * size)
	for i in size * size:
		out[i] = exact[i]
	return out

## Cluster strength 0..255 per tile for "rocks" or "grove" (decor-clusters.ts clusterMask).
static func cluster_mask(seed: int, size: int, kind: String) -> PackedByteArray:
	var salt := ROCKS_SALT if kind == "rocks" else GROVE_SALT
	var noise := MapGrid.noise_field(seed + salt, size, CLUSTER_CELL)
	var out := PackedByteArray()
	out.resize(size * size)
	for i in size * size:
		var strength := maxf(0.0, (noise[i] - CLUSTER_THRESHOLD) / (1.0 - CLUSTER_THRESHOLD))
		out[i] = int(floor(strength * 255.0 + 0.5))
	return out
