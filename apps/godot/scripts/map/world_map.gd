class_name WorldMap
extends Node2D
## The world map: ground as one mesh (a coloured diamond per tile), with region seams, bases, NPCs, HQs and
## marches drawn on top by MapOverlay. Terrain and regions are computed from `terrainSeed` (see MapMath), never
## sent. Placeholder flat colours; the real ground art and props come in a later slice.
## Map text is limited to short ASCII (NPC levels, HQ tags); names and menus live in the HUD controls.

const TERRAIN_COLORS: Array[Color] = [Color("cbb67f"), Color("b69b63"), Color("86965a"), Color("8f877a")]
const LIBERATED_WASH := Color("e0b040")
const LIBERATED_WASH_ALPHA := 0.24

var size: int = 0
var terrain_seed: int = 0
var snapshot: Dictionary = {}
var liberated: Dictionary = {}
## Segment endpoints (pairs) of region borders, in world coordinates. `seam_liberated[i]` is true when the
## segment borders a liberated region.
var seam_points := PackedVector2Array()
var seam_liberated: Array[bool] = []

var _terrain := PackedInt32Array()
var _regions := PackedInt32Array()
var _ground := MeshInstance2D.new()
var _overlay := MapOverlay.new()

func _ready() -> void:
	add_child(_ground)
	add_child(_overlay)

func overlay() -> MapOverlay:
	return _overlay

func region_at_tile(x: int, y: int) -> int:
	if x < 0 or y < 0 or x >= size or y >= size:
		return -1
	return _regions[y * size + x]

func terrain_at_tile(x: int, y: int) -> String:
	if x < 0 or y < 0 or x >= size or y >= size:
		return ""
	return MapGrid.TERRAIN_IDS[_terrain[y * size + x]]

## Builds the map from a `GET /v1/map` reply. Waits one frame first so a loading label can be drawn.
func build(snap: Dictionary) -> void:
	snapshot = snap
	size = int(snap["size"])
	terrain_seed = int(snap["terrainSeed"])
	liberated = Balance.liberated_regions(snap["liberations"], int(snap["now"]))
	var region_cell := int(Balance.data()["map"]["regionCell"])
	# One frame so the loading text is drawn before the (short) blocking work below.
	await get_tree().process_frame
	var grid := MapGrid.compute(terrain_seed, size, region_cell)
	_terrain = grid["terrain"]
	_regions = grid["regions"]
	_build_ground()
	_build_seams()
	_overlay.setup(self)

func _tile_color(x: int, y: int) -> Color:
	var color := TERRAIN_COLORS[_terrain[y * size + x]]
	# Cosmetic per-tile shade so flat ground is not a single block of colour.
	var shade := (float(MapMath.hash32([terrain_seed, x, y, 5]) % 1000) / 1000.0 - 0.5) * 0.06
	color = Color(color.r + shade, color.g + shade, color.b + shade)
	if liberated.has(_regions[y * size + x]):
		color = color.lerp(LIBERATED_WASH, LIBERATED_WASH_ALPHA)
	return color

func _build_ground() -> void:
	var verts := PackedVector2Array()
	var colors := PackedColorArray()
	var indices := PackedInt32Array()
	verts.resize(size * size * 4)
	colors.resize(size * size * 4)
	indices.resize(size * size * 6)
	for y in size:
		for x in size:
			var i := y * size + x
			var corners := Iso.footprint(x, y, 1, 1)
			var color := _tile_color(x, y)
			for c in 4:
				verts[i * 4 + c] = corners[c]
				colors[i * 4 + c] = color
			var v := i * 4
			var k := i * 6
			indices[k] = v
			indices[k + 1] = v + 1
			indices[k + 2] = v + 2
			indices[k + 3] = v
			indices[k + 4] = v + 2
			indices[k + 5] = v + 3
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	_ground.mesh = mesh

## A seam is the shared edge between two tiles of different regions: right neighbour (x+1, y) and
## lower neighbour (x, y+1) are checked once per tile.
func _build_seams() -> void:
	seam_points = PackedVector2Array()
	seam_liberated = []
	for y in size:
		for x in size:
			var own := _regions[y * size + x]
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
