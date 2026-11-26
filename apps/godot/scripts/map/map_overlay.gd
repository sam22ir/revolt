class_name MapOverlay
extends Node2D
## Bases, NPC targets, resource sites and alliance HQs, drawn above the ground (the marching columns are MarchMarkers).
## The pictures are MapArt's; rings and glows under them say whose they are. Canvas text is limited to NPC level numbers and 2-4 character ASCII HQ tags (rule 6).

const BASE_SPAN := 2
const BASE_OWN := Color("e0b43c")
const BASE_ALLY := Color("3fae6a")
const BASE_OTHER := Color("9fb0d0")
const NPC_HOSTILE := Color("c2412d")
const OUTLINE := Color(1.0, 0.95, 0.72)
const NPC_SIZE := 1.45
const NPC_GROUND := Color(0.35, 0.12, 0.08, 0.28)
const BADGE_FILL := Color("2b2219")
const BADGE_RING := Color("c8964a")
const BADGE_RING_FORTIFIED := Color("d0573a")
const SITE_SIZE := 0.9
const SITE_BADGE_RADIUS := 9.0
const SITE_BADGE_FONT := 14
const SITE_POLE := Color("6f6c64")
const SITE_TAKEN_TINT := Color(0.62, 0.58, 0.55)
const SITE_FLAG_OTHER := Color("9fb0d0")
const SITE_FLAG_MINE := Color("e0b43c")
const HQ_OWN := Color("2f9e8f")
const HQ_OTHER := Color("6a55a8")
const SELECTION_COLOR := Color(1.0, 0.97, 0.78)
const TEXT_SUPERSAMPLE := 4
const BADGE_FONT := 16
const BADGE_HEIGHT := 26.0
const BADGE_MIN_WIDTH := 44.0
const NAME_PATTERN := "^[ -~]{1,12}$"
const TAG_PATTERN := "^[A-Z0-9]{2,4}$"

enum Mode { SEAMS, OBJECTS }

var map: WorldMap
## SEAMS draws the liberation wash and region borders (under the props); OBJECTS draws bases, NPCs and HQs (above them).
var mode := Mode.OBJECTS
## How many times the overlay has been drawn (used by tests to prove the draw code ran).
var draw_count := 0
## The selected target or tile (x, y), or (-1, -1): outlined above everything else.
var selected := Vector2i(-1, -1)
var _name_re := RegEx.create_from_string(NAME_PATTERN)
var _tag_re := RegEx.create_from_string(TAG_PATTERN)

func setup(m: WorldMap) -> void:
	map = m
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	queue_redraw()

func _draw() -> void:
	if map == null or map.size == 0:
		return
	draw_count += 1
	if mode == Mode.SEAMS:
		# The ground draws the borders and the liberated wash now (map_ground.gdshader).
		return
	var snap := map.snapshot
	# Sites first: they are scenery under the camps, NPCs and HQs.
	for site: Dictionary in SitesModel.sites(snap):
		_draw_site(site)
	for b: Dictionary in snap["bases"]:
		_draw_base(b)
	for n: Dictionary in snap["npcs"]:
		_draw_npc(n)
	for h: Dictionary in snap["hqs"]:
		_draw_hq(h)
	_draw_selection(snap)

func _draw_base(b: Dictionary) -> void:
	var x := int(b["x"])
	var y := int(b["y"])
	var corners := Iso.footprint(x, y, BASE_SPAN, BASE_SPAN)
	var relation := _relation(b)
	var mine := relation == "mine"
	# Soft contact shadow plus an owner-coloured glow (stacked shrinking diamonds) so the art melts into the ground.
	var centre := (corners[0] + corners[2]) * 0.5
	var tint := _relation_color(relation)
	for step in 4:
		var k := 1.12 - 0.12 * step
		draw_colored_polygon(_scaled(corners, centre, k), Color(0.12, 0.08, 0.04, 0.10))
	for step in 3:
		draw_colored_polygon(_scaled(corners, centre, 0.95 - 0.12 * step), Color(tint, 0.16))
	_draw_piece("base", centre)
	_draw_badge(b, corners[2] + Vector2(0, 2), tint)

## A rounded name plate under the base in the owner colour. Canvas text stays short ASCII (rule 6): a handle in
## another script gets a plain coloured plate with no text.
func _draw_badge(b: Dictionary, top_centre: Vector2, color: Color) -> void:
	var text := _badge_text(b)
	var font := ThemeDB.fallback_font
	var width := maxf(BADGE_MIN_WIDTH, font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, BADGE_FONT).x + 18.0) if text != "" else BADGE_MIN_WIDTH
	var rect := Rect2(top_centre - Vector2(width * 0.5, 0), Vector2(width, BADGE_HEIGHT))
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.17, 0.13, 0.10, 0.92)
	box.border_color = color
	box.set_border_width_all(3)
	box.set_corner_radius_all(int(BADGE_HEIGHT * 0.5))
	draw_style_box(box, rect)
	if text != "":
		_draw_text(text, rect.position + Vector2(width * 0.5, BADGE_HEIGHT - 8.0), BADGE_FONT, Color("fff8e6"))

func _badge_text(b: Dictionary) -> String:
	var handle := _text(b.get("tag"))
	if not _name_re.search(handle):
		return ""
	var alliance := _text(b.get("alliance"))
	return ("[%s] %s" % [alliance, handle]) if alliance != "" else handle

## "mine", "ally" (same alliance tag as my base) or "other" (neutral player).
func _relation(b: Dictionary) -> String:
	if b["mine"]:
		return "mine"
	var tag := _text(b.get("alliance"))
	if tag != "" and tag == _my_alliance():
		return "ally"
	return "other"

func _my_alliance() -> String:
	for b: Dictionary in map.snapshot["bases"]:
		if b["mine"]:
			return _text(b.get("alliance"))
	return ""

## A snapshot field as text. A base outside any alliance has `alliance: null`, which String() can't convert.
static func _text(value: Variant) -> String:
	return "" if value == null else str(value)

func _relation_color(relation: String) -> Color:
	match relation:
		"mine":
			return BASE_OWN
		"ally":
			return BASE_ALLY
	return BASE_OTHER

static func _scaled(points: PackedVector2Array, about: Vector2, k: float) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p in points:
		out.append(about + (p - about) * k)
	return out

func _draw_npc(n: Dictionary) -> void:
	var c := Iso.tile_center(int(n["x"]), int(n["y"]))
	var kind := String(n["kind"])
	var half_w := Iso.TILE_W * 0.5 * NPC_SIZE
	var half_h := Iso.TILE_H * 0.5 * NPC_SIZE
	var diamond := PackedVector2Array([c + Vector2(0, -half_h), c + Vector2(half_w, 0), c + Vector2(0, half_h), c + Vector2(-half_w, 0)])
	draw_colored_polygon(diamond, NPC_GROUND)
	draw_polyline(PackedVector2Array([diamond[0], diamond[1], diamond[2], diamond[3], diamond[0]]), Color(NPC_HOSTILE, 0.7), 2.0)
	if MapArt.has(kind):
		_draw_piece(kind, c)
	var ring := BADGE_RING_FORTIFIED if kind == "fortified_line" else BADGE_RING
	_draw_level_badge(c + Vector2(half_w * 0.62, -half_h * 0.7), 11.0, str(int(n["level"])), ring, 16)

## A piece's picture with its footprint's centre at `centre`.
func _draw_piece(name: String, centre: Vector2, tint := Color.WHITE) -> void:
	draw_texture_rect(MapArt.texture(name), MapArt.rect(name, centre), false, tint)

## A dark disc with a coloured ring and a level number: the NPC and resource site badge.
func _draw_level_badge(at: Vector2, radius: float, text: String, ring: Color, font_size: int) -> void:
	draw_circle(at, radius, BADGE_FILL)
	draw_arc(at, radius, 0.0, TAU, 20, ring, 2.0)
	_draw_text(text, at + Vector2(0, font_size * 0.375), font_size, Color("fff8e6"))

## A resource site: a field or a quarry inside its own tile, fuller with its level, with a level badge. Free sites are plain; a site another player holds is shaded with a flag; one of the viewer's has a gold glow,
## ring and flag (as a base does). Scenery, so it stays lighter than camps and NPCs.
func _draw_site(site: Dictionary) -> void:
	var c := Iso.tile_center(int(site["x"]), int(site["y"]))
	var state := SitesModel.state_of(site)
	var half_w := Iso.TILE_W * 0.5 * SITE_SIZE
	var half_h := Iso.TILE_H * 0.5 * SITE_SIZE
	var diamond := PackedVector2Array([c + Vector2(0, -half_h), c + Vector2(half_w, 0), c + Vector2(0, half_h), c + Vector2(-half_w, 0)])
	if state == "mine":
		for step in 2:
			draw_colored_polygon(_scaled(diamond, c, 1.25 + 0.2 * step), Color(SITE_FLAG_MINE, 0.18))
	_draw_piece(MapArt.site(String(site["kind"]), int(site["level"])), c, SITE_TAKEN_TINT if state == "taken" else Color.WHITE)
	if state == "mine":
		draw_polyline(PackedVector2Array([diamond[0], diamond[1], diamond[2], diamond[3], diamond[0]]), SITE_FLAG_MINE, 3.0)
	if state != "free":
		_draw_site_flag(c + Vector2(0, -half_h), SITE_FLAG_MINE if state == "mine" else SITE_FLAG_OTHER)
	_draw_level_badge(c + Vector2(half_w * 0.62, -half_h * 0.7), SITE_BADGE_RADIUS, SitesModel.label(site), SITE_FLAG_MINE if state == "mine" else BADGE_RING, SITE_BADGE_FONT)

## A short pole with a pennant at the site's top corner.
func _draw_site_flag(base: Vector2, color: Color) -> void:
	var top := base + Vector2(0, -16)
	draw_line(base, top, SITE_POLE, 2.0)
	draw_colored_polygon(PackedVector2Array([top, top + Vector2(10, 4), top + Vector2(0, 8)]), color)

func _draw_hq(h: Dictionary) -> void:
	var c := Iso.tile_center(int(h["x"]), int(h["y"]))
	var color := HQ_OWN if h["mine"] else HQ_OTHER
	var r := 0.62 * Iso.TILE_H
	draw_circle(c, r, Color(color, 0.35))
	draw_arc(c, r, 0.0, TAU, 28, color, 4.0 if h["mine"] else 3.0)
	_draw_piece("alliance_hq", c)
	var tag := String(h["tag"])
	if _tag_re.search(tag) != null:
		_draw_text(tag, c + Vector2(0, -r - 22), 16, Color("fff8e6"))

## Outlines the selected tile, or the whole square when it is a camp's tile.
func _draw_selection(snap: Dictionary) -> void:
	if selected.x < 0:
		return
	var span := 1
	for b: Dictionary in snap["bases"]:
		if int(b["x"]) == selected.x and int(b["y"]) == selected.y:
			span = BASE_SPAN
	var corners := Iso.footprint(selected.x, selected.y, span, span)
	var closed := corners.duplicate()
	closed.append(corners[0])
	draw_polyline(closed, SELECTION_COLOR, 4.0)

## Selects a tile (or clears with (-1, -1)) and redraws.
func set_selected(tile: Vector2i) -> void:
	selected = tile
	queue_redraw()

## Text is rasterised at TEXT_SUPERSAMPLE times the size and drawn scaled down, so it stays crisp when the camera zooms in.
func _draw_text(text: String, at: Vector2, font_size: int, color: Color) -> void:
	var font := ThemeDB.fallback_font
	var width := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	var origin := at - Vector2(width * 0.5, 0)
	draw_set_transform(origin, 0.0, Vector2.ONE / TEXT_SUPERSAMPLE)
	draw_string(font, Vector2.ZERO, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size * TEXT_SUPERSAMPLE, color)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
