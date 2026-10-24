class_name GroundArt
extends RefCounted
## The painted terrain art Phaser draws on the map: the frame manifest (frame rectangles and ground anchors) and the five
## atlases (decals, trees, rocks, peaks, scrub), copied by `pnpm godot:export` from apps/client.
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

## Top-left of each prop atlas inside the packed props texture.
const PACK_ORIGIN := {"trees": Vector2i(0, 0), "rocks": Vector2i(1024, 0), "peaks": Vector2i(0, 1032), "scrub": Vector2i(1024, 1032)}
const PACK_SIZE := Vector2i(2048, 1720)

static func load_art() -> GroundArt:
	var art := GroundArt.new()
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST_PATH))
	art.atlases["decals"] = _atlas("decals", manifest["decals"])
	for kind in PROP_KINDS:
		art.atlases[kind] = _atlas("props-" + kind, manifest["props"][kind])
	art._pack_props()
	return art

func _pack_props() -> void:
	var image := Image.create_empty(PACK_SIZE.x, PACK_SIZE.y, false, Image.FORMAT_RGBA8)
	var frames: Array = []
	for kind in PROP_KINDS:
		var atlas: Dictionary = atlases[kind]
		var src: Image = (atlas["texture"] as Texture2D).get_image()
		src.convert(Image.FORMAT_RGBA8)
		var origin: Vector2i = PACK_ORIGIN[kind]
		image.blit_rect(src, Rect2i(Vector2i.ZERO, src.get_size()), origin)
		prop_first_frame[kind] = frames.size()
		for f: Dictionary in atlas["frames"]:
			var moved := f.duplicate()
			moved["x"] = float(f["x"]) + origin.x
			moved["y"] = float(f["y"]) + origin.y
			frames.append(moved)
	props_atlas = {"texture": ImageTexture.create_from_image(image), "size": Vector2(PACK_SIZE), "frames": frames}

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
