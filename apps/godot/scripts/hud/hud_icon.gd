class_name HudIcon
extends TextureRect
## One flat icon of the HUD set (art/icons/*.svg, white on transparent, 96 px viewBox), tinted by `tint`. The set is drawn once
## as SVG so it stays sharp at every phone density. `mirrored` flips it for the layout direction (arrows).

const DIR := "res://art/icons/"
const NAMES: Array[String] = ["food", "materiel", "funds", "support", "heroes", "alliance", "reports", "map", "base", "builders", "marches", "avatar", "back", "chevron", "upgrade", "info", "train", "settings", "power", "hammer", "wounded"]

static var _cache := {}

var icon_name := ""

## `size` is in mockup px (see HudTheme).
func _init(name_id := "", size := 20.0, tint := HudTheme.TEXT) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	custom_minimum_size = Vector2.ONE * HudTheme.px(size)
	self_modulate = tint
	set_icon(name_id)

func set_icon(name_id: String) -> void:
	icon_name = name_id
	texture = load_texture(name_id)

static func load_texture(name_id: String) -> Texture2D:
	if name_id == "":
		return null
	if not _cache.has(name_id):
		_cache[name_id] = load(DIR + name_id + ".svg")
	return _cache[name_id]
