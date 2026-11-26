class_name WorldMap
extends Node2D
## The world map: GroundLayer (the inked land with its roads, riverbeds, pools, region borders and the liberated wash; see
## docs/map-ground-ink-plan.md), the frontier (Frontier) behind and before the props, props (trees, rocks, peaks, scrub), then bases, NPCs, HQs and marches. Terrain, regions, geography and
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
## The search grid columns walk on (RoutePath), built with the map.
var _route_grid: AStarGrid2D
var _regions := PackedInt32Array()
var _ground := GroundLayer.new()
var _seams := MapOverlay.new()
var _props := PropLayer.new()
var _behind := FrontierView.new(FrontierView.Side.BEHIND)
var _in_front := FrontierView.new(FrontierView.Side.FRONT)
var _haze := FrontierHaze.new()
var _objects := MapOverlay.new()
var _markers := MarchMarkers.new()
var _art: GroundArt
var _plan: Dictionary = {}
## True while `build` is running (it yields); a live snapshot that arrives meanwhile waits in `_pending`.
var _building := false
## How many full builds ran (tests use it to prove a live snapshot did not rebuild the ground).
var build_count := 0
var _pending: Dictionary = {}

func _ready() -> void:
	_seams.mode = MapOverlay.Mode.SEAMS
	_objects.mode = MapOverlay.Mode.OBJECTS
	add_child(_ground)
	add_child(_seams)
	add_child(_behind)
	add_child(_props)
	# Before the objects, so no fence ever covers a base or its name.
	add_child(_in_front)
	add_child(_haze)
	add_child(_objects)
	_markers.setup(self)
	add_child(_markers)

## The overlay that draws bases, NPCs, HQs and marches.
func overlay() -> MapOverlay:
	return _objects

## The marching columns, drawn above the objects.
func markers() -> MarchMarkers:
	return _markers

func prop_layer() -> PropLayer:
	return _props

func ground_layer() -> GroundLayer:
	return _ground

func route_grid() -> AStarGrid2D:
	return _route_grid

## Region id per tile, row-major (shared, not copied: do not change it).
func region_grid() -> PackedInt32Array:
	return _regions

func region_at_tile(x: int, y: int) -> int:
	if x < 0 or y < 0 or x >= size or y >= size:
		return -1
	return _regions[y * size + x]

func terrain_at_tile(x: int, y: int) -> String:
	if x < 0 or y < 0 or x >= size or y >= size:
		return ""
	return MapGrid.TERRAIN_IDS[_terrain[y * size + x]]

## Shows or hides one layer ("ground", "props", "objects"). Debug aid: the page URL parameter `?hide=props` uses it (see main.gd).
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
			_markers.visible = visible_now
		_:
			_ground.set_part_visible(layer, visible_now)

## Props show from PROP_ZOOM up. Called when the camera zoom changes.
func set_view_zoom(view_zoom: float) -> void:
	_props.visible = view_zoom >= PROP_ZOOM
	_behind.set_props_visible(_props.visible)
	_in_front.set_props_visible(_props.visible)
	_ground.set_view_zoom(view_zoom)

## Builds the map from a `GET /v1/map` reply. Yields between the heavy stages so the page stays alive.
func build(snap: Dictionary) -> void:
	_building = true
	build_count += 1
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
	# The server sends the landmarks with the first map; without them (an old server, a test) they are computed here.
	var sent: Variant = Geography.from_wire(size, snap.get("geography"))
	var geo: Dictionary = sent if sent != null else Geography.build(terrain_seed, size, region_cell, _terrain, _regions)
	var flags := Geography.with_oasis_front(geo["flags"], geo["oases"], size)
	_route_grid = RoutePath.grid_for(size, _terrain, flags)
	var fertility := GroundMath.fertility_grid(terrain_seed, size)
	var rocks := GroundMath.cluster_mask(terrain_seed, size, "rocks")
	var grove := GroundMath.cluster_mask(terrain_seed, size, "grove")
	await get_tree().process_frame
	_plan = GroundPlan.build(terrain_seed, size, _terrain, flags, fertility, rocks, grove, _art.decal_frames_by_kind(), true)
	await get_tree().process_frame
	var land := GroundField.land(size, grid["height"], _terrain, fertility, rocks, grove, flags)
	var features := GroundField.features(size, FeatureShape.wadi_paths(geo["wadis"]), FeatureShape.road_paths(geo["roads"]), geo["oases"])
	_ground.build(size, land, features)
	_build_seams()
	_props.build(size, _plan["props"], _art, occupied_tiles())
	_build_frontier()
	_seams.setup(self)
	_objects.setup(self)
	_building = false
	if not _pending.is_empty():
		var next := _pending
		_pending = {}
		await apply_snapshot(next)

## The fences and towers, and the trees and rocks past the edge.
func _build_frontier() -> void:
	for view: FrontierView in [_behind, _in_front]:
		view.setup(size, _plan["props"], _art)
	_haze.setup(size)

## Takes a live snapshot (map socket). The ground depends only on the terrain seed, so it is never rebuilt for the same
## seed and size: bases, NPCs, HQs and marches are swapped and redrawn, the seams are rebuilt when the liberated regions
## changed, and the props when the occupied tiles did. During a build only the latest snapshot is kept, and applied after.
func apply_snapshot(snap: Dictionary) -> void:
	if _building:
		_pending = snap
		return
	if int(snap["size"]) != size or int(snap["terrainSeed"]) != terrain_seed:
		await build(snap)
		return
	var occupied_before := occupied_tiles()
	snapshot = snap
	var now_liberated := Balance.liberated_regions(snap["liberations"], int(snap["now"]))
	if now_liberated != liberated:
		liberated = now_liberated
		_build_seams()
		_seams.setup(self)
	if occupied_tiles() != occupied_before:
		refresh_props()
	_objects.setup(self)

## The tile indices kept free of props: the 3x3 ring around every base, NPC, HQ and resource site (bases and targets are drawn wider than
## their tile), as ground-layer.ts trackOccupied does. It comes from the snapshot, so props are rebuilt when it changes.
func occupied_tiles() -> Dictionary:
	var out := {}
	for list_name in ["bases", "npcs", "hqs"]:
		for t: Dictionary in snapshot.get(list_name, []):
			_mark_ring(out, t)
	for site: Dictionary in SitesModel.sites(snapshot):
		_mark_ring(out, site)
	return out

func _mark_ring(out: Dictionary, t: Dictionary) -> void:
	for dy in range(-1, 2):
		for dx in range(-1, 2):
			var x := int(t["x"]) + dx
			var y := int(t["y"]) + dy
			if x >= 0 and y >= 0 and x < size and y < size:
				out[y * size + x] = true

## Rebuilds the props after the snapshot's occupied tiles changed.
func refresh_props() -> void:
	if _art != null and not _plan.is_empty():
		_props.build(size, _plan["props"], _art, occupied_tiles())

## A seam is the shared edge between two tiles of different regions: right neighbour (x+1, y) and
## lower neighbour (x, y+1) are checked once per tile.
func _build_seams() -> void:
	_ground.set_regions(size, _regions, liberated)
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
