class_name MapPicker
extends RefCounted
## Which tile a tap on the map means, from the shapes the overlay draws (map_overlay.gd), tested in the reverse of its draw order so the
## shape on top wins: an HQ ring, then a target's diamond or level badge, then a camp's whole 2x2 square, then the tile under the finger.
## The Godot counterpart of Phaser's `tapTarget`: the shapes are flat, so no sprite reach is needed, but a target's diamond is wider
## than its tile and its badge sits up and to the right of the centre. Within a layer the last one drawn is tested first too; the map's
## placement spacing (2 tiles) keeps two diamonds from overlapping at all, so that is a guard, not a case that happens.

const BADGE_RADIUS := 11.0

## The target's tile (x, y) for the world point `world`, or (-1, -1) off the map.
static func pick(snapshot: Dictionary, size: int, world: Vector2) -> Vector2i:
	var hqs: Array = snapshot["hqs"]
	for i in range(hqs.size() - 1, -1, -1):
		var h: Dictionary = hqs[i]
		var c := Iso.tile_center(int(h["x"]), int(h["y"]))
		if world.distance_to(c) <= 0.62 * Iso.TILE_H:
			return Vector2i(int(h["x"]), int(h["y"]))
	var npcs: Array = snapshot["npcs"]
	for i in range(npcs.size() - 1, -1, -1):
		var n: Dictionary = npcs[i]
		if _in_npc(n, world):
			return Vector2i(int(n["x"]), int(n["y"]))
	var frac := Iso.world_to_tile(world)
	for b: Dictionary in snapshot["bases"]:
		var x := int(b["x"])
		var y := int(b["y"])
		if frac.x >= x and frac.x < x + MapOverlay.BASE_SPAN and frac.y >= y and frac.y < y + MapOverlay.BASE_SPAN:
			return Vector2i(x, y)
	var tile := Vector2i(int(floor(frac.x)), int(floor(frac.y)))
	if tile.x < 0 or tile.y < 0 or tile.x >= size or tile.y >= size:
		return Vector2i(-1, -1)
	return tile

static func _in_npc(n: Dictionary, world: Vector2) -> bool:
	var c := Iso.tile_center(int(n["x"]), int(n["y"]))
	var half_w := Iso.TILE_W * 0.5 * MapOverlay.NPC_SIZE
	var half_h := Iso.TILE_H * 0.5 * MapOverlay.NPC_SIZE
	var d := world - c
	if absf(d.x) / half_w + absf(d.y) / half_h <= 1.0:
		return true
	return world.distance_to(c + Vector2(half_w * 0.62, -half_h * 0.7)) <= BADGE_RADIUS
