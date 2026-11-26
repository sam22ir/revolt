class_name PropLayer
extends Node2D
## Trees, rocks, peaks and scrub as one batch, in painter's order (ground-props.ts placeTileProps): each prop's atlas
## anchor lands on tileCenter(x + dx, y + dy), scaled PROP_SCALE[kind] * plan.scale; drawing order follows x + y + dx + dy,
## ties by plan order. Tiles in `occupied` (the ring around bases, NPCs and HQs) show no props: every prop is built once and those are
## hidden, so a new base or target only changes a few sprites (a full rebuild takes a quarter of a second on a 192-tile map).

var _batch: SpriteBatch
## The sprites of the last build in drawing order (kept for tests; a headless renderer stores no MultiMesh data).
var sorted_sprites: Array = []
## Sprite indices per tile index (the prop's own tile), and the tiles hidden now.
var _by_tile := {}
var _hidden := {}

## `props`: GroundPlan.build()["props"]; `occupied`: {tile index: true}.
func build(size: int, props: Array, art: GroundArt, occupied: Dictionary) -> void:
	if _batch != null:
		_batch.queue_free()
		_batch = null
	var items: Array = []
	var order := 0
	for p: Dictionary in props:
		var i: int = p["i"]
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
			"tile": i,
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
	_by_tile = {}
	for it: Dictionary in items:
		# A packed array read from a dictionary is a copy: append to it, then put it back.
		var at: PackedInt32Array = _by_tile.get(it["tile"], PackedInt32Array())
		at.append(sorted_sprites.size())
		_by_tile[it["tile"]] = at
		sorted_sprites.append(it["sprite"])
	_batch = SpriteBatch.new(art.props_atlas)
	add_child(_batch)
	_batch.set_sprites(sorted_sprites)
	_hidden = {}
	set_occupied(occupied)

## Hides the props on `occupied` tiles and shows the rest again, touching only the tiles that changed.
func set_occupied(occupied: Dictionary) -> void:
	if _batch == null or _batch.multimesh == null:
		return
	for tile: int in _hidden.keys():
		if not occupied.has(tile):
			_show_tile(tile, true)
			_hidden.erase(tile)
	for tile: int in occupied.keys():
		if not _hidden.has(tile) and _by_tile.has(tile):
			_show_tile(tile, false)
			_hidden[tile] = true

func _show_tile(tile: int, shown: bool) -> void:
	for k: int in _by_tile.get(tile, PackedInt32Array()):
		_batch.set_alpha(k, float(sorted_sprites[k]["alpha"]) if shown else 0.0)

## Props shown (hidden ones are not counted).
func sprite_count() -> int:
	if _batch == null or _batch.multimesh == null:
		return 0
	var hidden := 0
	for tile: int in _hidden.keys():
		hidden += (_by_tile.get(tile, PackedInt32Array()) as PackedInt32Array).size()
	return _batch.multimesh.instance_count - hidden
