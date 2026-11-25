class_name GroundArt
extends RefCounted
## The map's trees, rocks, peaks and scrub: the frame manifest (frame rectangles and ground anchors, copied by `pnpm godot:export`
## from apps/client) and our own atlases rendered into those frames (tools/blender/map_pieces.py).
## Frame rectangles are in atlas pixels; props carry a ground anchor (ax, ay) inside the frame.

const MANIFEST_PATH := "res://art/terrain-manifest.json"
const ATLAS_DIR := "res://art/terrain/"

## World px per source px of each prop kind's atlas frames (ground-props.ts PROP_SCALE).
const PROP_SCALE := {"trees": 0.42, "rocks": 0.22, "peaks": 0.55, "scrub": 0.3}
const PROP_KINDS: Array[String] = ["trees", "rocks", "peaks", "scrub"]

## {"decals": Atlas, "trees": Atlas, ...}; an Atlas is {"texture": Texture2D, "size": Vector2, "frames": Array of Dictionary}.
var atlases := {}
## All four prop atlases packed into one texture (same Atlas shape), so a single batch draws every prop in painter's order.
var props_atlas := {}
## First index of each prop kind's frames inside `props_atlas["frames"]`.
var prop_first_frame := {}

static func load_art() -> GroundArt:
	var art := GroundArt.new()
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST_PATH))
	# Only the decals' frames are read (the ground plan picks frames by kind); their picture is no longer drawn.
	art.atlases["decals"] = {"texture": null, "size": Vector2(float(manifest["decals"]["w"]), float(manifest["decals"]["h"])), "frames": manifest["decals"]["frames"]}
	for kind in PROP_KINDS:
		art.atlases[kind] = _atlas("props-" + kind, manifest["props"][kind])
	art._pack_props()
	return art

## Packs the four prop atlases into one texture: trees and rocks side by side on the first row, peaks and scrub on the
## second. The layout comes from the manifest sizes, so re-cut art cannot overlap. The per-kind textures are released
## afterwards (only frame lists and sizes are kept), so the pixels are not held twice.
func _pack_props() -> void:
	var origins := pack_layout()
	var total: Vector2i = origins["size"]
	var image := Image.create_empty(total.x, total.y, false, Image.FORMAT_RGBA8)
	var frames: Array = []
	for kind in PROP_KINDS:
		var atlas: Dictionary = atlases[kind]
		var src: Image = (atlas["texture"] as Texture2D).get_image()
		src.convert(Image.FORMAT_RGBA8)
		var origin: Vector2i = origins[kind]
		image.blit_rect(src, Rect2i(Vector2i.ZERO, src.get_size()), origin)
		prop_first_frame[kind] = frames.size()
		for f: Dictionary in atlas["frames"]:
			var moved := f.duplicate()
			moved["x"] = float(f["x"]) + origin.x
			moved["y"] = float(f["y"]) + origin.y
			frames.append(moved)
		atlas["texture"] = null
	props_atlas = {"texture": ImageTexture.create_from_image(image), "size": Vector2(total), "frames": frames}

## Top-left of each prop atlas inside the packed texture, and the packed size: {"trees": Vector2i, ..., "size": Vector2i}.
func pack_layout() -> Dictionary:
	var s := {}
	for kind in PROP_KINDS:
		s[kind] = Vector2i(atlases[kind]["size"])
	var row1_h := maxi(s["trees"].y, s["rocks"].y)
	var row2_h := maxi(s["peaks"].y, s["scrub"].y)
	return {
		"trees": Vector2i(0, 0),
		"rocks": Vector2i(s["trees"].x, 0),
		"peaks": Vector2i(0, row1_h),
		"scrub": Vector2i(s["peaks"].x, row1_h),
		"size": Vector2i(maxi(s["trees"].x + s["rocks"].x, s["peaks"].x + s["scrub"].x), row1_h + row2_h),
	}

static func _atlas(file: String, entry: Dictionary) -> Dictionary:
	return {
		"texture": load(ATLAS_DIR + file + ".webp") as Texture2D,
		"size": Vector2(float(entry["w"]), float(entry["h"])),
		"frames": entry["frames"],
	}

## Decal atlas frames per kind ("sand", "grass", "stone", "track"), read from the manifest like Phaser does.
func decal_frames_by_kind() -> Dictionary:
	var out := {"sand": [], "grass": [], "stone": [], "track": []}
	var frames: Array = atlases["decals"]["frames"]
	for i in frames.size():
		out[frames[i]["kind"]].append(i)
	return out
