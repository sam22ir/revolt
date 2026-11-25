class_name HudIcon
extends TextureRect
## One icon of the HUD set (art/icons/*.svg): full-colour illustrations on a 256 px grid, drawn by tools/icons/build_icons.py.
## They carry their own colours, so nothing tints them; `set_dimmed` darkens one (an idle or muted icon).

const DIR := "res://art/icons/"
const NAMES: Array[String] = ["food", "materiel", "funds", "support", "heroes", "alliance", "reports", "map", "base", "builders", "marches", "avatar", "back", "chevron", "upgrade", "info", "train", "settings", "power", "hammer", "wounded", "clock", "lock", "storage",
	"troop_infantry", "troop_scouts", "troop_heavy", "troop_porters", "music", "effects", "language", "help",
	"link", "victory", "defeat", "gone", "npc_patrol", "npc_convoy", "npc_outpost", "npc_fortified_line",
	"chat", "hourglass", "offline", "hero_mountain_guide", "hero_dock_foreman", "hero_iron_quartermaster", "hero_hill_commander", "hero_trail_scout",
	"hero_field_medic", "hero_porter_chief", "hero_column_commander"]

static var _cache := {}

var icon_name := ""

## `size` is in mockup px (see HudTheme).
func _init(name_id := "", size := 20.0) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	custom_minimum_size = Vector2.ONE * HudTheme.px(size)
	set_icon(name_id)

## Half dark, for an icon with nothing to say at the moment.
func set_dimmed(dimmed: bool) -> void:
	self_modulate = Color(0.6, 0.58, 0.55) if dimmed else Color.WHITE

func set_icon(name_id: String) -> void:
	icon_name = name_id
	texture = load_texture(name_id)

static func load_texture(name_id: String) -> Texture2D:
	if name_id == "":
		return null
	if not _cache.has(name_id):
		_cache[name_id] = load(DIR + name_id + ".svg")
	return _cache[name_id]
