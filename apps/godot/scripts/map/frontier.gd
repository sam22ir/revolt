class_name Frontier
extends RefCounted
## The map's frontier, as pure geometry: the land outside is the map mirrored outward (so it meets the edge without a seam and never
## ends), and round the edge runs a raked strip between two iron fences. Nothing here is gameplay: no tile outside can be reached.

## How far out the mirrored trees and rocks go, in tiles, and the ground marks (seen from farther up); the haze hides the land past them.
const DEPTH := 15
const DECAL_DEPTH := 40
## Tiles next to the fence that stay bare, so nothing grows through it.
const CLEAR := 4
## The inner and outer fence, in tiles outside the map's edge; the raked strip is between them.
const INNER := 0.3
const OUTER := 2.4

## The tile inside the map that the outside tile `t` mirrors (-1 is 0, -2 is 1, `size` is `size - 1`).
static func mirror(t: int, size: int) -> int:
	var m := posmod(t, size * 2)
	return m if m < size else size * 2 - 1 - m

## How far outside a tile is (0 inside).
static func distance(x: int, y: int, size: int) -> int:
	return maxi(maxi(-x, x - size + 1), maxi(maxi(-y, y - size + 1), 0))

## The corners (top, right, bottom, left) of the map's outline `out` tiles outside its edge.
static func outline(size: int, out: float) -> PackedVector2Array:
	return Iso.footprint(-out, -out, size + out * 2.0, size + out * 2.0)

## True for the land behind the map (past its two upper edges), which is drawn before the map's own props.
static func is_behind(x: int, y: int) -> bool:
	return x < 0 or y < 0

## GroundPlan props mirrored onto the outside tiles, as PropLayer takes them plus "x" and "y"; `behind` picks the side.
static func mirrored_props(props: Array, size: int, behind: bool) -> Array:
	var by_tile := {}
	for p: Dictionary in props:
		if not by_tile.has(p["i"]):
			by_tile[p["i"]] = []
		by_tile[p["i"]].append(p)
	var out: Array = []
	for y in range(-DEPTH, size + DEPTH):
		for x in range(-DEPTH, size + DEPTH):
			if distance(x, y, size) < CLEAR or is_behind(x, y) != behind:
				continue
			for p: Dictionary in by_tile.get(mirror(y, size) * size + mirror(x, size), []):
				var copy := p.duplicate()
				copy["x"] = x
				copy["y"] = y
				out.append(copy)
	return out

## GroundPlan decals mirrored outside (the eight reflections, kept where they fall on the land that has them, clear of the strip).
static func mirrored_decals(decals: Array, size: int) -> Array:
	var out: Array = []
	for d: Dictionary in decals:
		var x := float(d["x"])
		var y := float(d["y"])
		for mx: float in [x, -x, size * 2.0 - x]:
			for my: float in [y, -y, size * 2.0 - y]:
				if mx == x and my == y:
					continue
				var out_by := maxf(maxf(-mx, mx - size), maxf(-my, my - size))
				if out_by < CLEAR or out_by > DECAL_DEPTH:
					continue
				var copy := d.duplicate()
				copy["x"] = mx
				copy["y"] = my
				out.append(copy)
	return out
