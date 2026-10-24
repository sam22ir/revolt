class_name GroundGrain
extends RefCounted
## The two seed-independent grain textures of the Phaser ground (ground-grain.ts): the green grain that the wash is weighted
## by, and the fine detail overlay (ground-detail.ts). The noise maths is exact (golden values in test_ground_grain.gd); the
## detail pebbles are only visual, since canvas anti-aliases its ellipses and this does not.

const GREEN_SIZE := 256
const DETAIL_SIZE := 512
const SALT_GRAIN_HASH := 2246822519
const MASK := 0xFFFFFFFF
const GREEN_RGB := [58, 70, 32]
## The baked textures (tools/bake_ground_grain.gd). The runtime loads these; the generators above are what they are checked against.
const GRAIN_PATH := "res://art/ground/ground-grain.png"
const DETAIL_PATH := "res://art/ground/ground-detail.png"

## Integer hash to [0, 1), with the constants of ground-grain.ts (not ground_math's hash01).
static func lattice_hash(i: int, j: int, salt: int) -> float:
	var h := GroundMath.imul32(i, 374761393) ^ GroundMath.imul32(j, 668265263) ^ GroundMath.imul32(salt, SALT_GRAIN_HASH)
	h = GroundMath.imul32(h ^ (h >> 13), 1274126177)
	h ^= h >> 16
	return float(h & MASK) / 4294967296.0

static func smooth(t: float) -> float:
	return t * t * (3.0 - 2.0 * t)

## Seamless value noise in [0, 1): random values on a lattice `cell` px apart, bilinearly blended, the lattice wrapping at `size`.
## The lattice index and weight of every row and column are worked out once, so the inner loop is only reads and blends.
static func tileable_noise(size: int, cell: int, salt: int) -> PackedFloat32Array:
	var n := maxi(1, roundi(float(size) / float(cell)))
	var lattice := PackedFloat32Array()
	lattice.resize(n * n)
	for j in n:
		for i in n:
			lattice[j * n + i] = lattice_hash(i, j, salt)
	var lo := PackedInt32Array()
	var hi := PackedInt32Array()
	var wt := PackedFloat32Array()
	lo.resize(size)
	hi.resize(size)
	wt.resize(size)
	for k in size:
		var f := fposmod(float(k) / float(cell), float(n))
		var i0 := int(floor(f))
		lo[k] = i0
		hi[k] = (i0 + 1) % n
		wt[k] = smooth(f - i0)
	var out := PackedFloat32Array()
	out.resize(size * size)
	for y in size:
		var r0 := lo[y] * n
		var r1 := hi[y] * n
		var ty := wt[y]
		for x in size:
			var i0 := lo[x]
			var i1 := hi[x]
			var tx := wt[x]
			var top := lattice[r0 + i0] * (1.0 - tx) + lattice[r0 + i1] * tx
			var bottom := lattice[r1 + i0] * (1.0 - tx) + lattice[r1 + i1] * tx
			out[y * size + x] = top * (1.0 - ty) + bottom * ty
	return out

## The seeded generator of ground-grain.ts `rng`, in [0, 1). Every step is masked to 32 bits, as the JavaScript ops are.
class Rng:
	var s: int

	func _init(seed_value: int) -> void:
		s = seed_value & GroundGrain.MASK

	func next() -> float:
		s = (s + 0x6d2b79f5) & GroundGrain.MASK
		var t := s
		t = GroundMath.imul32(t ^ (t >> 15), t | 1)
		t ^= (t + GroundMath.imul32(t ^ (t >> 7), t | 61)) & GroundGrain.MASK
		return float((t ^ (t >> 14)) & GroundGrain.MASK) / 4294967296.0

static func _byte(v: float) -> int:
	return clampi(roundi(v), 0, 255)

## The green grain tile (makeGreenGrain): dark olive mottling with alpha. The wash multiplies it by the fertility alpha in the shader.
static func green_grain() -> Image:
	var n := GREEN_SIZE
	var fine := tileable_noise(n, 8, 12)
	var coarse := tileable_noise(n, 32, 11)
	var bytes := PackedByteArray()
	bytes.resize(n * n * 4)
	for i in n * n:
		var m := clampf((0.6 * coarse[i] + 0.4 * fine[i] - 0.42) * 2.4, 0.0, 1.0)
		bytes[i * 4] = GREEN_RGB[0]
		bytes[i * 4 + 1] = GREEN_RGB[1]
		bytes[i * 4 + 2] = GREEN_RGB[2]
		bytes[i * 4 + 3] = _byte(m * 200.0)
	return Image.create_from_data(n, n, false, Image.FORMAT_RGBA8, bytes)

## The fine detail overlay (makeDetailTexture): soft mottling, grit and pale pebble clusters, opaque, for a MULTIPLY blend.
## Pebbles are stamped as anti-aliasing-free discs; the texture is seamless because the stamps wrap at DETAIL_SIZE.
static func detail_texture() -> Image:
	var n := DETAIL_SIZE
	var grain := tileable_noise(n, 4, 21)
	var mottle := tileable_noise(n, 64, 22)
	var broad := tileable_noise(n, 128, 23)
	var rgb := PackedFloat32Array()
	rgb.resize(n * n * 3)
	for i in n * n:
		var patch := (mottle[i] * 0.6 + broad[i] * 0.4) * 22.0
		var grit := maxf(0.0, (grain[i] - 0.7) / 0.3) * 34.0
		var dark := patch + grit
		rgb[i * 3] = 255.0 - dark
		rgb[i * 3 + 1] = 255.0 - dark * 1.05
		rgb[i * 3 + 2] = 255.0 - dark * 1.2
	var gather := tileable_noise(n, 48, 24)
	var r := Rng.new(31)
	for k in 400:
		var x := r.next() * n
		var y := r.next() * n
		var rad := 1.1 + r.next() * 1.3
		var shade := 150.0 + r.next() * 50.0
		var alpha := 0.25 + r.next() * 0.3
		var g := gather[(int(floor(y)) % n) * n + (int(floor(x)) % n)]
		if g < 0.58:
			continue
		# One stamp, wrapped: the canvas' copies at -n, 0 and n cover the same pixels once they wrap, so stamping them all would blend twice.
		_stamp_pebble(rgb, n, x, y, rad, shade, alpha)
	var bytes := PackedByteArray()
	bytes.resize(n * n * 4)
	for i in n * n:
		bytes[i * 4] = _byte(rgb[i * 3])
		bytes[i * 4 + 1] = _byte(rgb[i * 3 + 1])
		bytes[i * 4 + 2] = _byte(rgb[i * 3 + 2])
		bytes[i * 4 + 3] = 255
	return Image.create_from_data(n, n, false, Image.FORMAT_RGBA8, bytes)

## Blends one pebble ellipse (radii rad and rad * 0.6) into the RGB buffer, wrapping at `n`.
static func _stamp_pebble(rgb: PackedFloat32Array, n: int, cx: float, cy: float, rad: float, shade: float, alpha: float) -> void:
	var ry := rad * 0.6
	for py in range(int(floor(cy - ry)) - 1, int(ceil(cy + ry)) + 2):
		for px in range(int(floor(cx - rad)) - 1, int(ceil(cx + rad)) + 2):
			var u := (px + 0.5 - cx) / rad
			var v := (py + 0.5 - cy) / ry
			if u * u + v * v > 1.0:
				continue
			var i := (posmod(py, n) * n + posmod(px, n)) * 3
			rgb[i] = rgb[i] * (1.0 - alpha) + shade * alpha
			rgb[i + 1] = rgb[i + 1] * (1.0 - alpha) + shade * 0.86 * alpha
			rgb[i + 2] = rgb[i + 2] * (1.0 - alpha) + shade * 0.72 * alpha
