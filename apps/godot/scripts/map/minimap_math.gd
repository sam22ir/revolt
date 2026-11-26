class_name MinimapMath
extends RefCounted
## The minimap's geometry (apps/client ui/minimap-math.ts, base-arrow-math.ts): the map's diamond drawn `w` px wide and w / 2 tall,
## its top corner at (0, 0), never mirrored; and where an arrow on the screen's edge points at the player's base.

## Where tile corner (x, y) shows on a minimap `w` px wide (fractional tiles are fine).
static func tile_to_minimap(size: int, x: float, y: float, w: float) -> Vector2:
	return Vector2(((x - y) / size + 1.0) / 2.0 * w, (x + y) / (2.0 * size) * (w / 2.0))

## The tile under minimap point `p`, or (-1, -1) outside the map's diamond.
static func minimap_to_tile(size: int, p: Vector2, w: float) -> Vector2i:
	var u := 2.0 * p.x / w - 1.0
	var v := p.y / (w / 2.0)
	var x := size * (v + u / 2.0)
	var y := size * (v - u / 2.0)
	if x < 0.0 or y < 0.0 or x >= size or y >= size:
		return Vector2i(-1, -1)
	return Vector2i(int(floor(x)), int(floor(y)))

## An arrow on the edge of `band` (shrunk by `margin`) on the line from its centre to `target`: {"at": Vector2, "angle": radians, 0 to
## the right, clockwise}. Empty when the target is inside the band. An arrow landing in `avoid` (the minimap's corner) moves up out of it.
static func edge_arrow(target: Vector2, band: Rect2, margin: float, avoid := Rect2()) -> Dictionary:
	if band.has_point(target) or target == band.end:
		return {}
	var c := band.get_center()
	var d := target - c
	var hw := maxf(1.0, band.size.x / 2.0 - margin)
	var hh := maxf(1.0, band.size.y / 2.0 - margin)
	var s := minf(INF if d.x == 0.0 else hw / absf(d.x), INF if d.y == 0.0 else hh / absf(d.y))
	var at := c + d * s
	if avoid.has_area() and avoid.has_point(at):
		at.y = avoid.position.y
	return {"at": at, "angle": atan2(d.y, d.x)}
