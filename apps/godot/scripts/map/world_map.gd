class_name WorldMap
extends Node2D
## The world map, in Phaser's layer order: GroundLayer (colour field, wash, decals, roads/wadis/oases, rim), region seams and
## liberation wash, props (trees, rocks, peaks, scrub), then bases, NPCs, HQs and marches. Terrain, regions, geography and
## decoration are all computed from `terrainSeed` (MapGrid, Geography, GroundPlan), never sent by the server.
## Map text is limited to short ASCII (NPC levels, HQ tags); names and menus live in the HUD controls.

## Props are hidden below this view zoom: farther out the ground alone reads fine (ground-layer.ts PROP_ZOOM).
const PROP_ZOOM := 0.4

var size: int = 0
var terrain_seed: int = 0
var snapshot: Dictionary = {}
var liberated: Dictionary = {}
## Tile indices of liberated regions (for the gold wash).
var liberated_tiles := PackedInt32Array()
## Segment endpoints (pairs) of region borders, in world coordinates. `seam_liberated[i]` is true when the
## segment borders a liberated region.
var seam_points := PackedVector2Array()
var seam_liberated: Array[bool] = []

var _terrain := PackedInt32Array()
var _regions := PackedInt32Array()
var _ground := GroundLayer.new()
var _seams := MapOverlay.new()
var _props := PropLayer.new()
var _objects := MapOverlay.new()
var _art: GroundArt
var _plan: Dictionary = {}

func _ready() -> void:
	_seams.mode = MapOverlay.Mode.SEAMS
	_objects.mode = MapOverlay.Mode.OBJECTS
	add_child(_ground)
	add_child(_seams)
	add_child(_props)
	add_child(_objects)

## The overlay that draws bases, NPCs, HQs and marches.
func overlay() -> MapOverlay:
	return _objects

func prop_layer() -> PropLayer:
	return _props

func ground_layer() -> GroundLayer:
	return _ground

func region_at_tile(x: int, y: int) -> int:
	if x < 0 or y < 0 or x >= size or y >= size:
		return -1
	return _regions[y * size + x]

func terrain_at_tile(x: int, y: int) -> String:
	if x < 0 or y < 0 or x >= size or y >= size:
		return ""
	return MapGrid.TERRAIN_IDS[_terrain[y * size + x]]

## Shows or hides one layer ("ground", "decals", "features", "wash", "seams", "props", "objects"). Debug aid: the page URL
## parameter `?hide=decals,props` uses it (see main.gd).
func set_layer_visible(layer: String, visible_now: bool) -> void:
	match layer:
		"ground":
			_ground.visible = visible_now
		"seams":
			_seams.visible = visible_now
		"props":
			_props.visible = visible_now
		"objects":
			_objects.visible = visible_now
		_:
			_ground.set_part_visible(layer, visible_now)

## Props show from PROP_ZOOM up. Called when the camera zoom changes.
func set_view_zoom(view_zoom: float) -> void:
	_props.visible = view_zoom >= PROP_ZOOM
	_ground.set_view_zoom(view_zoom)

## Builds the map from a `GET /v1/map` reply. Yields between the heavy stages so the page stays alive.
func build(snap: Dictionary) -> void:
	snapshot = snap
	size = int(snap["size"])
	terrain_seed = int(snap["terrainSeed"])
	liberated = Balance.liberated_regions(snap["liberations"], int(snap["now"]))
	var region_cell := int(Balance.data()["map"]["regionCell"])
	# One frame so the loading text is drawn before the blocking work below.
	await get_tree().process_frame
	if _art == null:
		_art = GroundArt.load_art()
	var grid := MapGrid.compute(terrain_seed, size, region_cell)
	_terrain = grid["terrain"]
	_regions = grid["regions"]
	await get_tree().process_frame
	var geo := Geography.build(terrain_seed, size, region_cell, _terrain, _regions)
	var flags := Geography.with_oasis_front(geo["flags"], geo["oases"], size)
	var fertility := GroundMath.fertility_grid(terrain_seed, size)
	var rocks := GroundMath.cluster_mask(terrain_seed, size, "rocks")
	var grove := GroundMath.cluster_mask(terrain_seed, size, "grove")
	await get_tree().process_frame
	_plan = GroundPlan.build(terrain_seed, size, _terrain, flags, fertility, rocks, grove, _art.decal_frames_by_kind())
	await get_tree().process_frame
	_ground.build(size, _plan, fertility, FeatureShape.wadi_paths(geo["wadis"]), FeatureShape.road_paths(geo["roads"]), geo["oases"], _art)
	_build_seams()
	_props.build(size, _plan["props"], _art, occupied_tiles())
	_seams.setup(self)
	_objects.setup(self)

## The tile indices kept free of props: the 3x3 ring around every base, NPC and HQ (bases and targets are drawn wider than
## their tile), as ground-layer.ts trackOccupied does. It comes from the snapshot, so props are rebuilt when it changes.
func occupied_tiles() -> Dictionary:
	var out := {}
	for list_name in ["bases", "npcs", "hqs"]:
		for t: Dictionary in snapshot.get(list_name, []):
			for dy in range(-1, 2):
				for dx in range(-1, 2):
					var x := int(t["x"]) + dx
					var y := int(t["y"]) + dy
					if x >= 0 and y >= 0 and x < size and y < size:
						out[y * size + x] = true
	return out

## Rebuilds the props after the snapshot's occupied tiles changed.
func refresh_props() -> void:
	if _art != null and not _plan.is_empty():
		_props.build(size, _plan["props"], _art, occupied_tiles())

## A seam is the shared edge between two tiles of different regions: right neighbour (x+1, y) and
## lower neighbour (x, y+1) are checked once per tile.
func _build_seams() -> void:
	seam_points = PackedVector2Array()
	seam_liberated = []
	liberated_tiles = PackedInt32Array()
	for y in size:
		for x in size:
			var own := _regions[y * size + x]
			if liberated.has(own):
				liberated_tiles.append(y * size + x)
			if x + 1 < size and _regions[y * size + x + 1] != own:
				seam_points.append(Iso.tile_to_world(x + 1, y))
				seam_points.append(Iso.tile_to_world(x + 1, y + 1))
				seam_liberated.append(liberated.has(own) or liberated.has(_regions[y * size + x + 1]))
			if y + 1 < size and _regions[(y + 1) * size + x] != own:
				seam_points.append(Iso.tile_to_world(x, y + 1))
				seam_points.append(Iso.tile_to_world(x + 1, y + 1))
				seam_liberated.append(liberated.has(own) or liberated.has(_regions[(y + 1) * size + x]))

## The tile of the player's own base (top corner tile), or Vector2i(-1, -1) if the map has none for them.
func own_base_tile() -> Vector2i:
	for b: Dictionary in snapshot.get("bases", []):
		if b["mine"]:
			return Vector2i(int(b["x"]), int(b["y"]))
	return Vector2i(-1, -1)
