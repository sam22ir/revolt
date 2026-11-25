class_name PropLayer
extends Node2D
## Trees, rocks, peaks and scrub as one batch, in painter's order (ground-props.ts placeTileProps): each prop's atlas
## anchor lands on tileCenter(x + dx, y + dy), scaled PROP_SCALE[kind] * plan.scale; drawing order follows x + y + dx + dy,
## ties by plan order. Tiles in `occupied` (the ring around bases, NPCs and HQs) get no props.

var _batch: SpriteBatch
## The sprites of the last build in drawing order (kept for tests; a headless renderer stores no MultiMesh data).
var sorted_sprites: Array = []

## `props`: GroundPlan.build()["props"]; `occupied`: {tile index: true}.
func build(size: int, props: Array, art: GroundArt, occupied: Dictionary) -> void:
	if _batch != null:
		_batch.queue_free()
		_batch = null
	var items: Array = []
	var order := 0
	for p: Dictionary in props:
		var i: int = p["i"]
		if occupied.has(i):
			continue
		# A mirrored prop outside the map names its own tile (Frontier).
		var x: int = p.get("x", i % size)
		var y: int = p.get("y", i / size)
		var kind: String = p["kind"]
		var frames: Variant = p["frames"]
		var count: int = art.atlases[kind]["frames"].size()
		var local := int(floor(float(p["pick"]) * count)) if frames == null else int(frames[int(floor(float(p["pick"]) * frames.size()))])
		items.append({
			"key": x + y + float(p["dx"]) + float(p["dy"]),
			"order": order,
			"sprite": {
				"frame": int(art.prop_first_frame[kind]) + local,
				"pos": Iso.tile_to_world(x + float(p["dx"]) + 0.5, y + float(p["dy"]) + 0.5),
				"scale": float(GroundArt.PROP_SCALE[kind]) * float(p["scale"]),
				"flip": p["flip"],
				"alpha": 1.0,
			},
		})
		order += 1
	items.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if a["key"] != b["key"]:
			return a["key"] < b["key"]
		return a["order"] < b["order"])
	sorted_sprites = []
	for it: Dictionary in items:
		sorted_sprites.append(it["sprite"])
	_batch = SpriteBatch.new(art.props_atlas)
	add_child(_batch)
	_batch.set_sprites(sorted_sprites)

func sprite_count() -> int:
	return 0 if _batch == null or _batch.multimesh == null else _batch.multimesh.instance_count
