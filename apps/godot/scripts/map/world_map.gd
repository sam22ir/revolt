class_name WorldMap
extends Node2D
## The world map: GroundLayer (the inked land with its roads, riverbeds, pools, region borders and the liberated wash; see
## docs/map-ground-ink-plan.md), the frontier (Frontier) behind and before the props, props (trees, rocks, peaks, scrub), then bases, NPCs, HQs and marches. Terrain, regions, geography and
## decoration are all computed from `terrainSeed` (MapGrid, Geography, GroundPlan), never sent by the server.
## Map text is limited to short ASCII (NPC levels, HQ tags); names and menus live in the HUD controls.

## Props are hidden below this view zoom: farther out the ground alone reads fine (ground-layer.ts PROP_ZOOM).
const PROP_ZOOM := 0.4
## Props are worked out and drawn per chunk of CHUNK x CHUNK tiles, only for the chunks near the camera (windowed).
const CHUNK := 32
## World px round the view where chunks must be loaded (props stand up to about 250 px above their tile), and the wider margin a new
## window is cut with, so a small pan does not load again.
const NEED_MARGIN := 300.0
const LOAD_MARGIN := 900.0

var size: int = 0
var terrain_seed: int = 0
var snapshot: Dictionary = {}
## The ids of the villages the player has helped today (their need badge is not drawn). Set with `set_helped_villages`.
var helped_villages: Dictionary = {}
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
## Windowed: props only for the chunks round the view (set_view); otherwise the whole map's at once (tests, map shots).
var windowed := false
var _flags := PackedByteArray()
var _fertility := PackedFloat32Array()
var _rocks := PackedByteArray()
var _grove := PackedByteArray()
## Per chunk id (cy * chunks + cx): its plan props, and its draw items (PropLayer.items_for), worked out on first need.
var _chunk_props := {}
var _chunk_items := {}
## The chunk ids loaded now (the window), those still to work out (nearest the view first), and the last view asked for (applied
## again after a rebuild). A chunk's props are worked out a slice of rows a frame, so moving the window never stalls a frame.
var _loaded := {}
var _queue: Array[int] = []
var _working := -1
var _working_row := 0
var _working_props: Array = []
var _frontier_dressed := false
const ROWS_PER_FRAME := 8
var _last_view := Rect2()
var _last_zoom := 0.0
## Windowed maps draw the roads and riverbeds round the player's base first, then the rest a few ms a frame (GroundField.FeatureFill).
const FILL_RADIUS := 24.0
const FILL_BUDGET_MS := 6.0
const FILL_UPLOAD_MS := 250
var _fill: GroundField.FeatureFill
var _fill_uploaded_at := 0
## How long each stage of the last build took, in ms, in order (a debug aid: `?debug=fps` prints it).
var build_times: Array = []

## Draws in the rest of the roads and riverbeds, a few ms a frame, showing the picture now and then and when it is whole.
func _process(_delta: float) -> void:
	# One job a frame: a slice of a chunk's props while any are waiting, else a slice of the roads and riverbeds.
	if _working >= 0 or not _queue.is_empty():
		_work_chunks()
		return
	if _fill == null:
		set_process(false)
		return
	var whole := _fill.step(FILL_BUDGET_MS)
	if whole or Time.get_ticks_msec() - _fill_uploaded_at >= FILL_UPLOAD_MS:
		_ground.update_features(_fill.image())
		_fill_uploaded_at = Time.get_ticks_msec()
	if whole:
		_fill = null
		set_process(false)

## True while the roads and riverbeds, or chunks of props, are still being worked out (tests).
func is_filling_ground() -> bool:
	return _fill != null or _working >= 0 or not _queue.is_empty()

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
## Takes the villages helped today; the objects are drawn again only when the set changed.
func set_helped_villages(ids: Dictionary) -> void:
	if ids == helped_villages:
		return
	helped_villages = ids
	_objects.queue_redraw()

func markers() -> MarchMarkers:
	return _markers

func prop_layer() -> PropLayer:
	return _props

func ground_layer() -> GroundLayer:
	return _ground

## The grid columns are routed on, made on first use (a fifth of a second at 192, so not while the map loads).
func route_grid() -> AStarGrid2D:
	if _route_grid == null and size > 0 and _terrain.size() == size * size and _flags.size() == size * size:
		_route_grid = RoutePath.grid_for(size, _terrain, _flags)
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
	build_times = []
	var t := [Time.get_ticks_msec()]
	var lap := func(stage: String) -> void:
		build_times.append([stage, Time.get_ticks_msec() - t[0]])
		t[0] = Time.get_ticks_msec()
	snapshot = snap
	size = int(snap["size"])
	terrain_seed = int(snap["terrainSeed"])
	liberated = Balance.liberated_regions(snap["liberations"], int(snap["now"]))
	var region_cell := int(Balance.data()["map"]["regionCell"])
	# One frame so the loading text is drawn before the blocking work below.
	await get_tree().process_frame
	t[0] = Time.get_ticks_msec()
	if _art == null:
		_art = GroundArt.load_art()
	var grid := MapGrid.compute(terrain_seed, size, region_cell)
	_terrain = grid["terrain"]
	_regions = grid["regions"]
	lap.call("grid")
	await get_tree().process_frame
	t[0] = Time.get_ticks_msec()
	# The server sends the landmarks with the first map; without them (an old server, a test) they are computed here.
	var sent: Variant = Geography.from_wire(size, snap.get("geography"))
	var geo: Dictionary = sent if sent != null else Geography.build(terrain_seed, size, region_cell, _terrain, _regions)
	var flags := Geography.with_oasis_front(geo["flags"], geo["oases"], size)
	lap.call("geography")
	_flags = flags
	_route_grid = null
	var fertility := GroundMath.fertility_grid(terrain_seed, size)
	var rocks := GroundMath.cluster_mask(terrain_seed, size, "rocks")
	var grove := GroundMath.cluster_mask(terrain_seed, size, "grove")
	lap.call("fields")
	await get_tree().process_frame
	t[0] = Time.get_ticks_msec()
	_fertility = fertility
	_rocks = rocks
	_grove = grove
	_chunk_props = {}
	_chunk_items = {}
	_loaded = {}
	_queue = []
	_working = -1
	if not windowed:
		_plan = GroundPlan.build(terrain_seed, size, _terrain, flags, fertility, rocks, grove, _art.decal_frames_by_kind(), true)
	lap.call("ground plan")
	await get_tree().process_frame
	t[0] = Time.get_ticks_msec()
	var land := GroundField.land(size, grid["height"], _terrain, fertility, rocks, grove, flags)
	lap.call("land field")
	var features: Image
	_fill = null
	if windowed:
		# The base's surroundings now, the rest in the background (_process).
		var own := own_base_tile()
		var focus := Vector2(own) + Vector2(0.5, 0.5) if own.x >= 0 else Vector2(size, size) * 0.5
		_fill = GroundField.FeatureFill.new(size, FeatureShape.wadi_paths(geo["wadis"]), FeatureShape.road_paths(geo["roads"]), geo["oases"], focus)
		_fill.stamp_near(FILL_RADIUS)
		features = _fill.image()
		_fill_uploaded_at = Time.get_ticks_msec()
		set_process(true)
	else:
		features = GroundField.features(size, FeatureShape.wadi_paths(geo["wadis"]), FeatureShape.road_paths(geo["roads"]), geo["oases"])
	lap.call("feature field")
	_ground.build(size, land, features)
	_build_seams()
	lap.call("ground + seams")
	if not windowed:
		_props.build(size, _plan["props"], _art, occupied_tiles())
		lap.call("props")
	# The fences now; the trees past the edge with the chunks they mirror (windowed).
	_build_frontier([] if windowed else _plan["props"])
	lap.call("frontier")
	_seams.setup(self)
	_objects.setup(self)
	lap.call("overlays")
	_building = false
	if windowed and _last_zoom > 0.0:
		set_view(_last_view, _last_zoom)
	if not _pending.is_empty():
		var next := _pending
		_pending = {}
		await apply_snapshot(next)

## The fences and towers, and the trees and rocks past the edge.
func _build_frontier(props: Array) -> void:
	for view: FrontierView in [_behind, _in_front]:
		view.setup(size, props, _art)
	_haze.setup(size)

## Windowed maps: the camera shows `view` (world px) at `view_zoom`. Loads the chunks round it when it has moved past those loaded, and
## draws their props (filled in the background). Nothing loads while props are hidden (zoomed far out).
func set_view(view: Rect2, view_zoom: float) -> void:
	_last_view = view
	_last_zoom = view_zoom
	if not windowed or _art == null or size == 0 or view_zoom < PROP_ZOOM or _building:
		return
	var need := chunks_in(view.grow(NEED_MARGIN))
	var missing := false
	for c: int in need:
		if not _loaded.has(c):
			missing = true
			break
	if not missing and not _loaded.is_empty():
		return
	_loaded = {}
	var centre := view.get_center()
	var order := chunks_in(view.grow(LOAD_MARGIN))
	order.sort_custom(func(a: int, b: int) -> bool: return _chunk_centre(a).distance_squared_to(centre) < _chunk_centre(b).distance_squared_to(centre))
	_queue = []
	for c: int in order:
		_loaded[c] = true
		if not _chunk_items.has(c) and c != _working:
			_queue.append(c)
	if _queue.is_empty() and _working < 0:
		_show_window()
	set_process(true)

## Draws the props of the loaded chunks that are worked out (all of them once the queue is empty).
func _show_window() -> void:
	var lists: Array = []
	var raw: Array = []
	for c: int in _loaded.keys():
		if _chunk_items.has(c):
			lists.append(_chunk_items[c])
			raw.append_array(_chunk_props[c])
	_props.show_items(lists, _art, occupied_tiles())
	# The trees past the edge mirror the chunks along it: rebuilt only when the window holds such chunks, or did.
	var edge := _touches_edge()
	if edge or _frontier_dressed:
		_build_frontier(raw)
		_frontier_dressed = edge

## Whether a loaded chunk lies within the frontier's mirrored band of the map's edge.
func _touches_edge() -> bool:
	var n := ceili(float(size) / CHUNK)
	var band := ceili(float(Frontier.DEPTH) / CHUNK)
	for c: int in _loaded.keys():
		var cx := c % n
		var cy := c / n
		if mini(cx, cy) < band or maxi(cx, cy) >= n - band:
			return true
	return false

## Works out ROWS_PER_FRAME rows of the chunk at the head of the queue; true when the queue is empty.
func _work_chunks() -> bool:
	if _working < 0:
		if _queue.is_empty():
			return true
		_working = _queue.pop_front()
		_working_row = 0
		_working_props = []
	# A frame of its own for sorting the chunk's props once all its rows are worked out.
	if _working_row < CHUNK:
		var n := ceili(float(size) / CHUNK)
		var x0 := (_working % n) * CHUNK
		var y0 := (_working / n) * CHUNK + _working_row
		var rows := mini(ROWS_PER_FRAME, CHUNK - _working_row)
		_working_props.append_array(GroundPlan.chunk_props(size, _terrain, _flags, _fertility, _rocks, _grove, x0, y0, x0 + CHUNK, y0 + rows))
		_working_row += rows
	else:
		_chunk_props[_working] = _working_props
		_chunk_items[_working] = PropLayer.items_for(size, _working_props, _art)
		_working = -1
		# The chunks in view first: show them as soon as they are all ready, then the rest of the window.
		if _queue.is_empty():
			_show_window()
	return _queue.is_empty() and _working < 0

func _chunk_centre(c: int) -> Vector2:
	var n := ceili(float(size) / CHUNK)
	return Iso.tile_to_world((c % n) * CHUNK + CHUNK * 0.5, (c / n) * CHUNK + CHUNK * 0.5)

## Chunk ids whose tiles meet `rect` (world px). A chunk is a diamond on screen: its bounding box is tested.
func chunks_in(rect: Rect2) -> Array[int]:
	var n := ceili(float(size) / CHUNK)
	var out: Array[int] = []
	for cy in n:
		for cx in n:
			var x0 := cx * CHUNK
			var y0 := cy * CHUNK
			var x1 := mini(x0 + CHUNK, size)
			var y1 := mini(y0 + CHUNK, size)
			var top := Iso.tile_to_world(x0, y0)
			var right := Iso.tile_to_world(x1, y0)
			var bottom := Iso.tile_to_world(x1, y1)
			var left := Iso.tile_to_world(x0, y1)
			var box := Rect2(Vector2(left.x, top.y), Vector2(right.x - left.x, bottom.y - top.y))
			if box.intersects(rect):
				out.append(cy * n + cx)
	return out

## How many chunks are loaded (tests and debug).
func loaded_chunks() -> int:
	return _loaded.size()

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

## Hides the props on the snapshot's occupied tiles (and shows those freed) after it changed.
func refresh_props() -> void:
	if _art != null:
		_props.set_occupied(occupied_tiles())

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
