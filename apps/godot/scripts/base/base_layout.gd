class_name BaseLayout
extends RefCounted
## The base screen's geometry, ported from apps/client/src/scene/iso-layout.ts (golden values for the real sprite anchors in
## data/base-fixtures.json): plots, how a sprite sits on its plot, the ground slab, and the camera fit. This isometric grid
## (128 x 64 tiles, 6 x 6) is the base's own, not the world map's. Maths is done in doubles; Vector2 only on the way out.

const TILE_W := 128.0
const TILE_H := 64.0
const GRID_SIZE := 6
const WORLD_WIDTH := GRID_SIZE * TILE_W
const WORLD_HEIGHT := GRID_SIZE * TILE_H
## Every plot is the same size: the painted sprites share one plot diamond.
const PLOT_SIZE := 1.6
## Centres in a quincunx so no building hides another's middle (grid coordinates).
const PLOT_CENTERS := {
	"hq": [3.0, 3.0], "farm": [1.0, 2.6], "armory": [2.6, 1.0],
	"treasury": [5.0, 3.4], "barracks": [3.4, 5.0], "hero_hall": [1.0, 1.0],
}
## Fraction of the ground sprite's height that is slab thickness (its rim shows below the near edges).
const GROUND_RIM := 26.0 / 571.0
const MANIFEST := "res://art/buildings-manifest.json"
const SPRITE_DIR := "res://art/"
const GROUND_KEY := "buildings/ground_tile"

static var _manifest: Dictionary = {}

## Sprite anchors by key (`buildings/hq`): {w, h, bottom, left, right} in sprite pixels.
static func manifest() -> Dictionary:
	if _manifest.is_empty():
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST))
		assert(parsed is Dictionary, "buildings-manifest.json missing or invalid")
		_manifest = parsed
	return _manifest

static func sprite_key(id: String) -> String:
	return "buildings/" + id

## {gx, gy, size}: the grid coordinates of the plot's top corner.
static func plot(id: String) -> Dictionary:
	var c: Array = PLOT_CENTERS[id]
	return {"gx": c[0] - PLOT_SIZE / 2.0, "gy": c[1] - PLOT_SIZE / 2.0, "size": PLOT_SIZE}

static func iso_x(gx: float, gy: float) -> float:
	return (gx - gy) * TILE_W / 2.0

static func iso_y(gx: float, gy: float) -> float:
	return (gx + gy) * TILE_H / 2.0

static func iso_to_world(gx: float, gy: float) -> Vector2:
	return Vector2(iso_x(gx, gy), iso_y(gx, gy))

## The world point at the middle of a plot's footprint, at ground level, as {x, y} doubles.
static func plot_center(p: Dictionary) -> Dictionary:
	var gx: float = p["gx"] + p["size"] / 2.0
	var gy: float = p["gy"] + p["size"] / 2.0
	return {"x": iso_x(gx, gy), "y": iso_y(gx, gy)}

## Ground corners of a plot: top, right, bottom, left.
static func footprint(p: Dictionary) -> PackedVector2Array:
	var gx: float = p["gx"]
	var gy: float = p["gy"]
	var s: float = p["size"]
	return PackedVector2Array([iso_to_world(gx, gy), iso_to_world(gx + s, gy), iso_to_world(gx + s, gy + s), iso_to_world(gx, gy + s)])

static func map_center() -> Dictionary:
	return {"x": iso_x(GRID_SIZE / 2.0, GRID_SIZE / 2.0), "y": iso_y(GRID_SIZE / 2.0, GRID_SIZE / 2.0)}

## Scale so the sprite's plot diamond is as wide as the plot, and its diamond centre on the plot centre: {x, y, scale, height}
## where (x, y) is the sprite's top-left corner in world px and `height` how tall it stands above the plot centre.
static func place_sprite(p: Dictionary, info: Dictionary) -> Dictionary:
	var left: Dictionary = info["left"]
	var right: Dictionary = info["right"]
	var scale: float = float(p["size"]) * TILE_W / (float(right["x"]) - float(left["x"]))
	var cx := (float(left["x"]) + float(right["x"])) / 2.0
	var cy := (float(left["y"]) + float(right["y"])) / 2.0
	var c := plot_center(p)
	return {"x": c["x"] - cx * scale, "y": c["y"] - cy * scale, "scale": scale, "height": cy * scale}

## The ground slab stretched over the whole diamond: top-left corner and scale per axis.
static func place_ground(info: Dictionary) -> Dictionary:
	return {"x": -WORLD_WIDTH / 2.0, "y": 0.0, "sx": WORLD_WIDTH / float(info["w"]), "sy": WORLD_HEIGHT / (float(info["h"]) * (1.0 - GROUND_RIM))}

## Horizontal extent of the buildings (`{x, width}` per sprite, world px) and the whole ground diamond.
static func span(sprites: Array) -> float:
	var lo := -WORLD_WIDTH / 2.0
	var hi := WORLD_WIDTH / 2.0
	for s: Dictionary in sprites:
		lo = minf(lo, float(s["x"]))
		hi = maxf(hi, float(s["x"]) + float(s["width"]))
	return hi - lo

## Camera for the base: {zoom, cx, cy} (the world point at the middle of the view). `view` is the viewport size in px, `top`
## and `nav` the HUD room above and the nav bar below. The base keeps clear of both and must not refit when a panel opens.
static func fit(view_w: float, view_h: float, px: float, top: float, nav: float, span_px: float) -> Dictionary:
	var hud_top := top * px
	var hud_bottom := nav * px
	var usable_h := maxf(100.0 * px, view_h - hud_top - hud_bottom)
	var zoom := minf((view_w - 16.0 * px) / span_px, usable_h / (WORLD_HEIGHT + 80.0))
	var c := map_center()
	var offset := (hud_top - hud_bottom) / 2.0 / zoom
	return {"zoom": zoom, "cx": c["x"], "cy": float(c["y"]) - 30.0 - offset}
