class_name MapArt
extends RefCounted
## The map's pieces, rendered from the Blender models (tools/blender/map_pieces.py): camps, posts, sites and alliance halls. Each
## picture's size and the px its footprint's centre is at come from data/map-art.json.

const DIR := "res://art/map/"
const DATA_PATH := "res://data/map-art.json"
## Picture px per world px.
const SCALE := 3.0

static var _data: Dictionary = {}
## Kept, so a picture is read from disk once.
static var _textures := {}

static func _entry(name: String) -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	return _data.get(name, {})

static func has(name: String) -> bool:
	return not _entry(name).is_empty()

static func texture(name: String) -> Texture2D:
	if not _textures.has(name):
		_textures[name] = load(DIR + name + ".webp")
	return _textures[name]

## Where piece `name` is drawn when its footprint's centre is at `centre`.
static func rect(name: String, centre: Vector2) -> Rect2:
	var e := _entry(name)
	var offset := Vector2(e["centre"][0], e["centre"][1]) / SCALE
	return Rect2(centre - offset, Vector2(e["size"][0], e["size"][1]) / SCALE)

## The piece a resource site shows.
static func site(kind: String, level: int) -> String:
	return "%s_%d" % [kind, clampi(level, 1, 3)]
