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

## Sprites placed per frame while a window's batch fills in the background.
const FILL_PER_FRAME := 700

## The batch being filled for the next window (shown when full), its sprites, how far it is, and the tiles of each sprite.
var _next: SpriteBatch
var _next_sprites: Array = []
var _next_tiles := PackedInt32Array()
var _next_at := 0
var _occupied := {}

## Draw items for `props` (GroundPlan props, or a chunk of them): {key, order, tile, sprite}, sorted in painter's order. `order` breaks
## ties by tile and by the prop's place in its tile, so items from different chunks merge into the same order a whole-map build has.
static func items_for(size: int, props: Array, art: GroundArt) -> Array:
	var items: Array = []
	var seen := {}
	for p: Dictionary in props:
		var i: int = p["i"]
		var nth: int = seen.get(i, 0)
		seen[i] = nth + 1
		# A mirrored prop outside the map names its own tile (Frontier).
		var x: int = p.get("x", i % size)
		var y: int = p.get("y", i / size)
		var kind: String = p["kind"]
		var frames: Variant = p["frames"]
		var count: int = art.atlases[kind]["frames"].size()
		var local := int(floor(float(p["pick"]) * count)) if frames == null else int(frames[int(floor(float(p["pick"]) * frames.size()))])
		items.append({
			"key": x + y + float(p["dx"]) + float(p["dy"]),
			"order": (y * size + x) * 16 + nth,
			"tile": i,
			"sprite": {
				"frame": int(art.prop_first_frame[kind]) + local,
				"pos": Iso.tile_to_world(x + float(p["dx"]) + 0.5, y + float(p["dy"]) + 0.5),
				"scale": float(GroundArt.PROP_SCALE[kind]) * float(p["scale"]),
				"flip": p["flip"],
				"alpha": 1.0,
			},
		})
	items.sort_custom(_before)
	return items

static func _before(a: Dictionary, b: Dictionary) -> bool:
	if a["key"] != b["key"]:
		return a["key"] < b["key"]
	return a["order"] < b["order"]

## Sorted item lists merged into one sorted list (each list already in painter's order): linear in the items, no sort.
static func merge(lists: Array) -> Array:
	var out: Array = []
	var at := PackedInt32Array()
	at.resize(lists.size())
	while true:
		var best := -1
		for k in lists.size():
			if at[k] < (lists[k] as Array).size() and (best < 0 or _before(lists[k][at[k]], lists[best][at[best]])):
				best = k
		if best < 0:
			return out
		out.append(lists[best][at[best]])
		at[best] += 1
	return out

## `props`: GroundPlan.build()["props"]; `occupied`: {tile index: true}. Everything at once (tests, map shots, the frontier).
func build(size: int, props: Array, art: GroundArt, occupied: Dictionary) -> void:
	_cancel_next()
	var items := items_for(size, props, art)
	var sprites: Array = []
	var tiles := PackedInt32Array()
	for it: Dictionary in items:
		sprites.append(it["sprite"])
		tiles.append(it["tile"])
	var batch := SpriteBatch.new(art.props_atlas)
	batch.begin(sprites.size())
	batch.fill(sprites, 0, sprites.size())
	_swap(batch, sprites, tiles, occupied)

## Shows these sorted item lists (the loaded chunks): the batch fills FILL_PER_FRAME sprites a frame in the background and replaces the
## shown one when full, so moving the window never stalls a frame. A newer call starts the fill again.
func show_items(lists: Array, art: GroundArt, occupied: Dictionary) -> void:
	_cancel_next()
	_occupied = occupied
	_next_sprites = []
	_next_tiles = PackedInt32Array()
	for it: Dictionary in merge(lists):
		_next_sprites.append(it["sprite"])
		_next_tiles.append(it["tile"])
	_next = SpriteBatch.new(art.props_atlas)
	_next.begin(_next_sprites.size())
	_next_at = 0
	set_process(true)

## True while a window's batch is still filling.
func is_filling() -> bool:
	return _next != null

func _process(_delta: float) -> void:
	if _next == null:
		set_process(false)
		return
	var to := mini(_next_at + FILL_PER_FRAME, _next_sprites.size())
	_next.fill(_next_sprites, _next_at, to)
	_next_at = to
	if _next_at >= _next_sprites.size():
		var batch := _next
		_next = null
		_swap(batch, _next_sprites, _next_tiles, _occupied)
		set_process(false)

func _cancel_next() -> void:
	if _next != null:
		_next.free()
		_next = null

func _swap(batch: SpriteBatch, sprites: Array, tiles: PackedInt32Array, occupied: Dictionary) -> void:
	if _batch != null:
		_batch.queue_free()
	_batch = batch
	add_child(_batch)
	sorted_sprites = sprites
	_by_tile = {}
	for k in tiles.size():
		# A packed array read from a dictionary is a copy: append to it, then put it back.
		var at: PackedInt32Array = _by_tile.get(tiles[k], PackedInt32Array())
		at.append(k)
		_by_tile[tiles[k]] = at
	_hidden = {}
	set_occupied(occupied)

## Hides the props on `occupied` tiles and shows the rest again, touching only the tiles that changed.
func set_occupied(occupied: Dictionary) -> void:
	_occupied = occupied
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
