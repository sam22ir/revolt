class_name Iso
extends RefCounted
## Isometric projection of the world map, identical to apps/client/src/scene/world-layout.ts so art and
## coordinates carry over: a tile is a 96x48 diamond (2:1). World origin (0, 0) is the top corner of tile
## (0, 0); +x runs down-right, +y runs down-left.

const TILE_W := 96.0
const TILE_H := 48.0

## World position of the top corner of tile (tx, ty). Fractions allowed.
static func tile_to_world(tx: float, ty: float) -> Vector2:
	return Vector2((tx - ty) * TILE_W * 0.5, (tx + ty) * TILE_H * 0.5)

## Centre of tile (tx, ty).
static func tile_center(tx: int, ty: int) -> Vector2:
	return tile_to_world(tx + 0.5, ty + 0.5)

## Fractional tile coordinates of a world point; floor() them for the tile under it.
static func world_to_tile(world: Vector2) -> Vector2:
	return Vector2(world.y / TILE_H + world.x / TILE_W, world.y / TILE_H - world.x / TILE_W)

## The world rectangle that contains a `size` x `size` map.
static func world_bounds(size: int) -> Rect2:
	return Rect2(-size * TILE_W * 0.5, 0.0, size * TILE_W, size * TILE_H)

## The four corners of a w x h tile footprint whose top corner tile is (tx, ty): top, right, bottom, left.
static func footprint(tx: float, ty: float, w: float, h: float) -> PackedVector2Array:
	return PackedVector2Array([
		tile_to_world(tx, ty),
		tile_to_world(tx + w, ty),
		tile_to_world(tx + w, ty + h),
		tile_to_world(tx, ty + h),
	])
